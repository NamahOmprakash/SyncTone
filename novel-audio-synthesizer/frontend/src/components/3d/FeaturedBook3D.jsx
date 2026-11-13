import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  createPageEdgeTexture,
  createSpineTexture,
  createBackCoverTexture,
} from './bookTextures';
import { CANONICAL_COVERS } from '../NovelCover';

function resolveCoverUrl(novel) {
  if (novel?.cover_object) return novel.cover_object;
  const normalized = (novel?.title || '').toLowerCase().trim();
  return CANONICAL_COVERS[normalized] ||
    Object.entries(CANONICAL_COVERS).find(([k]) => normalized.includes(k))?.[1] || null;
}

/**
 * Procedural Contact Shadow Texture
 * Soft gaussian blurred ellipse matching the book's footprint on the stage floor.
 */
function createContactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 120);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
  grad.addColorStop(0.35, 'rgba(0, 0, 0, 0.45)');
  grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.15)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * FeaturedBook3D Component
 * Genuine WebGL 3D physical hardcover book model powered by Three.js.
 * Features realistic cover texture, visible curved spine with gold foil accents,
 * layered page block thickness, soft floor shadow, ambient/specular lighting,
 * smooth idle floating, and interactive pointer drag rotation.
 */
export default function FeaturedBook3D({
  novel,
  volumeIndex = 0,
  onSelectNovel,
  isPaused = false,
  className = '',
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [webglError, setWebglError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // References for Three.js scene instances
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const bookMeshRef = useRef(null);
  const shadowMeshRef = useRef(null);
  const animFrameIdRef = useRef(null);

  // Interaction tracking
  const pointerPosRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragRotationRef = useRef({ x: 0, y: 0 });
  const isPointerDownRef = useRef(false);
  const hasMovedRef = useRef(false);
  const isVisibleRef = useRef(true);

  // Base presentation resting angles
  const BASE_ROTATION_Y = -0.34;
  const BASE_ROTATION_X = 0.12;

  // Initialize Three.js Scene
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // Check WebGL availability before instantiating renderer
    const checkWebGL = () => {
      try {
        const testCanvas = document.createElement('canvas');
        return Boolean(
          window.WebGLRenderingContext &&
            (testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl'))
        );
      } catch (_) {
        return false;
      }
    };

    if (!checkWebGL()) {
      setWebglError(true);
      return;
    }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(container.clientWidth, container.clientHeight, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      rendererRef.current = renderer;
    } catch (e) {
      console.warn('WebGL not supported or context initialization failed:', e);
      setWebglError(true);
      return;
    }

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      34,
      container.clientWidth / container.clientHeight,
      0.1,
      50
    );
    camera.position.set(0, 0.1, 6.3);

    // =========================================================================
    // Lighting Setup: Warm Key Light + Specular Fill + Balanced Ambient
    // =========================================================================
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff8ee, 2.2);
    keyLight.position.set(3.5, 5, 4.5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdde8ff, 1.0);
    fillLight.position.set(-4, 2, -3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xc5a059, 0.8);
    rimLight.position.set(0, -4, 2);
    scene.add(rimLight);

    // =========================================================================
    // Book Geometry & Materials
    // =========================================================================
    // Hardcover proportions: Width: 2.15, Height: 3.12, Thickness: 0.38
    const bookGeometry = new THREE.BoxGeometry(2.15, 3.12, 0.38);

    const pageEdgeTexture = createPageEdgeTexture();
    const pageEdgeMaterial = new THREE.MeshStandardMaterial({
      map: pageEdgeTexture,
      roughness: 0.88,
      metalness: 0.02,
    });

    const spineTexture = createSpineTexture(novel, volumeIndex + 1);
    const spineMaterial = new THREE.MeshStandardMaterial({
      map: spineTexture,
      roughness: 0.42,
      metalness: 0.15,
    });

    const backCoverTexture = createBackCoverTexture(novel);
    const backCoverMaterial = new THREE.MeshStandardMaterial({
      map: backCoverTexture,
      roughness: 0.45,
      metalness: 0.12,
    });

    // Front cover texture loaded from resolved cover URL
    const textureLoader = new THREE.TextureLoader();
    const coverUrl = resolveCoverUrl(novel);
    const frontCoverTexture = coverUrl
      ? textureLoader.load(coverUrl)
      : spineTexture;
    frontCoverTexture.colorSpace = THREE.SRGBColorSpace;

    const frontCoverMaterial = new THREE.MeshStandardMaterial({
      map: frontCoverTexture,
      roughness: 0.32,
      metalness: 0.08,
    });

    // Material array: [+X (pages), -X (spine), +Y (top pages), -Y (bottom pages), +Z (front), -Z (back)]
    const materials = [
      pageEdgeMaterial, // +X: Right page block
      spineMaterial,    // -X: Left book spine
      pageEdgeMaterial, // +Y: Top page block
      pageEdgeMaterial, // -Y: Bottom page block
      frontCoverMaterial, // +Z: Front cover
      backCoverMaterial,  // -Z: Back cover
    ];

    const bookMesh = new THREE.Mesh(bookGeometry, materials);
    bookMesh.position.set(0, 0, 0);
    bookMesh.rotation.set(BASE_ROTATION_X, BASE_ROTATION_Y, 0);
    scene.add(bookMesh);
    bookMeshRef.current = bookMesh;

    // =========================================================================
    // Contact Shadow Plane
    // =========================================================================
    const shadowGeo = new THREE.PlaneGeometry(3.6, 2.2);
    const shadowTex = createContactShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.set(0, -1.82, 0);
    shadowMesh.rotation.x = -Math.PI / 2;
    scene.add(shadowMesh);
    shadowMeshRef.current = shadowMesh;

    // =========================================================================
    // Render & Animation Loop
    // =========================================================================
    let clock = new THREE.Clock();

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      if (!isVisibleRef.current) return;

      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      // Check reduced motion
      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Smooth pointer parallax easing
      pointerPosRef.current.x += (pointerPosRef.current.targetX - pointerPosRef.current.x) * 0.06;
      pointerPosRef.current.y += (pointerPosRef.current.targetY - pointerPosRef.current.y) * 0.06;

      if (bookMeshRef.current) {
        if (isPointerDownRef.current) {
          // User is actively dragging: direct rotation control
          bookMeshRef.current.rotation.y = dragRotationRef.current.y;
          bookMeshRef.current.rotation.x = dragRotationRef.current.x;
        } else {
          // Returning smoothly to base angle + resting float
          const floatOffset = prefersReduced ? 0 : Math.sin(elapsedTime * 1.5) * 0.06;
          const floatRotY = prefersReduced ? 0 : Math.sin(elapsedTime * 1.1) * 0.035;
          const floatRotX = prefersReduced ? 0 : Math.cos(elapsedTime * 1.3) * 0.02;

          const targetY = BASE_ROTATION_Y + pointerPosRef.current.x * 0.25 + floatRotY;
          const targetX = BASE_ROTATION_X - pointerPosRef.current.y * 0.18 + floatRotX;

          bookMeshRef.current.rotation.y += (targetY - bookMeshRef.current.rotation.y) * 0.08;
          bookMeshRef.current.rotation.x += (targetX - bookMeshRef.current.rotation.x) * 0.08;
          bookMeshRef.current.position.y += (floatOffset - bookMeshRef.current.position.y) * 0.08;

          // Shadow reacts dynamically to book height
          if (shadowMeshRef.current) {
            const shadowScale = 1 - Math.abs(floatOffset) * 0.8;
            shadowMeshRef.current.scale.set(shadowScale, shadowScale, 1);
            shadowMeshRef.current.material.opacity = 0.55 - floatOffset * 0.8;
          }
        }
      }

      renderer.render(scene, camera);
    };

    animFrameIdRef.current = requestAnimationFrame(animate);

    // =========================================================================
    // Resize Observer for Aspect Ratio Stability
    // =========================================================================
    const handleResize = () => {
      if (!container || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // =========================================================================
    // Intersection Observer (Pauses loop when off-screen)
    // =========================================================================
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isVisibleRef.current = entry.isIntersecting;
    });
    intersectionObserver.observe(container);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      resizeObserver.disconnect();
      intersectionObserver.disconnect();

      // Memory Cleanup & WebGL Resource Deallocation
      bookGeometry.dispose();
      materials.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
      shadowGeo.dispose();
      shadowTex.dispose();
      shadowMat.dispose();
      renderer.dispose();
    };
  }, []);

  // Update Cover, Spine and Back Materials when novel or volume changes
  useEffect(() => {
    if (!bookMeshRef.current || !novel) return;

    const materials = bookMeshRef.current.material;
    if (!Array.isArray(materials)) return;

    // Cinematic flip transition effect: briefly rotate book to highlight the new volume
    if (bookMeshRef.current) {
      bookMeshRef.current.rotation.y += 0.25;
    }

    // Load new front cover texture
    const textureLoader = new THREE.TextureLoader();
    const coverUrl = resolveCoverUrl(novel);
    if (coverUrl) {
      textureLoader.load(coverUrl, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        if (materials[4]) {
          if (materials[4].map) materials[4].map.dispose();
          materials[4].map = texture;
          materials[4].needsUpdate = true;
        }
      });
    }

    // Re-generate spine and back cover textures with current novel metadata
    const spineTexture = createSpineTexture(novel, volumeIndex + 1);
    if (materials[1]) {
      if (materials[1].map) materials[1].map.dispose();
      materials[1].map = spineTexture;
      materials[1].needsUpdate = true;
    }

    const backTexture = createBackCoverTexture(novel);
    if (materials[5]) {
      if (materials[5].map) materials[5].map.dispose();
      materials[5].map = backTexture;
      materials[5].needsUpdate = true;
    }
  }, [novel?.id, volumeIndex]);

  // Pointer Parallax (mousemove over stage)
  const handlePointerMove = useCallback((e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    if (isPointerDownRef.current) {
      const deltaX = (e.clientX - dragStartRef.current.x) * 0.012;
      const deltaY = (e.clientY - dragStartRef.current.y) * 0.012;

      if (Math.abs(deltaX) > 0.02 || Math.abs(deltaY) > 0.02) {
        hasMovedRef.current = true;
      }

      dragRotationRef.current.y += deltaX;
      // Clamp vertical tilt to avoid flipping upside down
      dragRotationRef.current.x = Math.max(
        -0.45,
        Math.min(0.65, dragRotationRef.current.x + deltaY)
      );

      dragStartRef.current = { x: e.clientX, y: e.clientY };
    } else {
      pointerPosRef.current.targetX = Math.max(-1, Math.min(1, x));
      pointerPosRef.current.targetY = Math.max(-1, Math.min(1, y));
    }
  }, []);

  const handlePointerDown = useCallback((e) => {
    isPointerDownRef.current = true;
    hasMovedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    if (bookMeshRef.current) {
      dragRotationRef.current = {
        x: bookMeshRef.current.rotation.x,
        y: bookMeshRef.current.rotation.y,
      };
    }
    setIsDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerUp = useCallback(
    (e) => {
      isPointerDownRef.current = false;
      setIsDragging(false);
      e.currentTarget.releasePointerCapture?.(e.pointerId);

      // If user did not drag, treat as click to open novel
      if (!hasMovedRef.current && onSelectNovel && novel?.id) {
        onSelectNovel(novel.id);
      }
    },
    [onSelectNovel, novel?.id]
  );

  const handlePointerLeave = useCallback(() => {
    pointerPosRef.current.targetX = 0;
    pointerPosRef.current.targetY = 0;
    if (isPointerDownRef.current) {
      isPointerDownRef.current = false;
      setIsDragging(false);
    }
  }, []);

  // Graceful CSS Fallback when WebGL is unavailable
  if (webglError) {
    return (
      <div
        onClick={() => onSelectNovel && novel?.id && onSelectNovel(novel.id)}
        className={`relative w-52 sm:w-60 lg:w-64 aspect-[2/3] tilted-cover cursor-pointer group rounded-xl overflow-hidden shadow-2xl ${className}`}
        title={novel?.title}
      >
        <img
          src={resolveCoverUrl(novel)}
          alt={novel?.title}
          className="w-full h-full object-cover rounded-xl"
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      className={`relative w-64 sm:w-72 lg:w-80 h-[380px] sm:h-[420px] lg:h-[460px] flex items-center justify-center select-none ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      } ${className}`}
      aria-label={`Interactive 3D book model of ${novel?.title || 'Featured Novel'}. Click and drag to rotate, or click to explore.`}
      role="region"
      title={`${novel?.title} • Drag to rotate 3D book, click to open`}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block focus:outline-none"
        tabIndex={0}
      />

      {/* Floating 3D Interaction Hint Badge */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 sm:opacity-80 transition-opacity duration-300">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[10px] font-mono uppercase text-white/90 shadow-md">
          <svg viewBox="0 0 24 24" className="w-3 h-3 text-[#C5A059]" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12a8 8 0 0 1 14.93-4M20 12a8 8 0 0 1-14.93 4" strokeLinecap="round" />
            <path d="M19 8h-4V4M5 16h4v4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Drag 360° • Click to Open</span>
        </span>
      </div>
    </div>
  );
}
