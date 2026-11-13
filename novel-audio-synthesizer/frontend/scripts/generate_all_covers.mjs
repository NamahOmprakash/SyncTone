import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const COVERS = [
  {
    filename: 'harry-potter-philosophers-stone-cover.webp',
    title: "Harry Potter and the Philosopher's Stone",
    author: "J.K. Rowling",
    subtitle: "BOOK 1 // THE BOY WHO LIVED",
    palette: {
      bg: '#0A0E1A',
      accent: '#FFD700',
      secondary: '#4B0082',
      text: '#F5F5F7',
      glow: 'rgba(255, 215, 0, 0.45)',
    },
    art: `
      <!-- Gothic Castle Silhouette & Astronomy Sky -->
      <defs>
        <radialGradient id="skyGlow" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#2D1B69" />
          <stop offset="45%" stop-color="#120A2E" />
          <stop offset="100%" stop-color="#05030A" />
        </radialGradient>
        <linearGradient id="castleGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#1A1528" />
          <stop offset="100%" stop-color="#090710" />
        </linearGradient>
      </defs>
      <rect width="600" height="900" fill="url(#skyGlow)" />
      <!-- Star field -->
      <g opacity="0.8">
        <circle cx="80" cy="120" r="1.5" fill="#FFF" opacity="0.9" />
        <circle cx="150" cy="80" r="1" fill="#FFF" opacity="0.6" />
        <circle cx="230" cy="140" r="2" fill="#FFD700" opacity="0.8" />
        <circle cx="480" cy="100" r="1.5" fill="#FFF" opacity="0.8" />
        <circle cx="520" cy="170" r="2" fill="#FFD700" opacity="0.7" />
        <circle cx="340" cy="90" r="1.5" fill="#FFF" opacity="0.9" />
        <circle cx="400" cy="150" r="1" fill="#FFF" opacity="0.5" />
        <circle cx="120" cy="220" r="1.5" fill="#FFF" opacity="0.6" />
        <circle cx="460" cy="240" r="2" fill="#FFF" opacity="0.9" />
        <!-- Glowing Crescent Moon -->
        <circle cx="450" cy="160" r="45" fill="#FFF9D2" opacity="0.85" filter="drop-shadow(0 0 25px rgba(255,249,210,0.6))" />
        <circle cx="468" cy="152" r="42" fill="#120A2E" />
      </g>
      <!-- Hogwarts Castle Spires -->
      <g fill="url(#castleGrad)">
        <polygon points="300,280 280,480 320,480" />
        <polygon points="250,330 235,490 265,490" />
        <polygon points="350,320 335,490 365,490" />
        <polygon points="200,370 185,510 215,510" />
        <polygon points="400,360 385,510 415,510" />
        <polygon points="140,410 125,520 155,520" />
        <polygon points="460,400 445,520 475,520" />
        <!-- Crag base -->
        <path d="M50,560 Q150,520 300,530 T550,550 L600,900 L0,900 Z" fill="#07050C" />
      </g>
      <!-- Glowing magical owl / snitch sparkle -->
      <circle cx="300" cy="265" r="4" fill="#FFD700" filter="drop-shadow(0 0 12px #FFD700)" />
      <path d="M290,265 Q300,255 310,265 Q300,275 290,265 Z" fill="none" stroke="#FFD700" stroke-width="1.5" opacity="0.8" />
    `
  },
  {
    filename: 'adventures-of-sherlock-holmes-cover.webp',
    title: "The Adventures of Sherlock Holmes",
    author: "Arthur Conan Doyle",
    subtitle: "A STRAND MAGAZINE CLASSIC // 1892",
    palette: {
      bg: '#0F1115',
      accent: '#D4AF37',
      secondary: '#1C2026',
      text: '#F0F0F2',
      glow: 'rgba(212, 175, 55, 0.4)',
    },
    art: `
      <!-- Victorian London Gaslamp, Fog & Detective Silhouette -->
      <defs>
        <radialGradient id="lampGlow" cx="50%" cy="38%" r="55%">
          <stop offset="0%" stop-color="#FFDD78" stop-opacity="0.9" />
          <stop offset="30%" stop-color="#B8860B" stop-opacity="0.4" />
          <stop offset="70%" stop-color="#14171D" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#08090C" />
        </radialGradient>
      </defs>
      <rect width="600" height="900" fill="url(#lampGlow)" />
      <!-- Victorian architecture silhouettes in fog -->
      <g fill="#0B0D11" opacity="0.6">
        <rect x="50" y="320" width="80" height="300" />
        <polygon points="90,260 50,320 130,320" />
        <rect x="470" y="310" width="90" height="320" />
        <polygon points="515,240 470,310 560,310" />
        <!-- Big Ben distant spire -->
        <rect x="370" y="240" width="40" height="350" />
        <polygon points="390,170 370,240 410,240" />
      </g>
      <!-- Cobblestone ground -->
      <path d="M0,580 L600,580 L600,900 L0,900 Z" fill="#07080A" />
      <!-- Gas lamp post -->
      <g stroke="#D4AF37" stroke-width="3" fill="none">
        <line x1="210" y1="360" x2="210" y2="600" stroke-width="5" stroke="#1A1D24" />
        <polygon points="195,360 225,360 220,330 200,330" fill="#FFDD78" opacity="0.8" />
        <polygon points="190,365 230,365 222,320 198,320" stroke="#D4AF37" stroke-width="2" />
        <circle cx="210" cy="345" r="16" fill="#FFDD78" opacity="0.3" filter="drop-shadow(0 0 20px #FFDD78)" />
      </g>
      <!-- Sherlock Holmes Profile with Deerstalker & Pipe -->
      <g fill="#050608">
        <path d="M300,580 C300,520 320,490 350,470 C350,450 340,430 330,420 C320,410 330,395 345,395 C360,395 375,405 385,415 C395,420 410,425 410,435 C405,445 390,448 385,455 C385,465 400,475 410,490 C420,505 430,530 435,580 Z" />
        <!-- Pipe -->
        <path d="M385,455 Q410,465 415,480" stroke="#050608" stroke-width="4" fill="none" />
        <circle cx="417" cy="482" r="5" fill="#050608" />
        <!-- Deerstalker brim -->
        <path d="M320,415 Q355,400 395,412" stroke="#050608" stroke-width="8" fill="none" />
      </g>
    `
  },
  {
    filename: 'a-study-in-scarlet-cover.webp',
    title: "A Study in Scarlet",
    author: "Arthur Conan Doyle",
    subtitle: "THE DEBUT OF SHERLOCK HOLMES // 1887",
    palette: {
      bg: '#140606',
      accent: '#E63946',
      secondary: '#2B0E11',
      text: '#F8F9FA',
      glow: 'rgba(230, 57, 70, 0.45)',
    },
    art: `
      <!-- Baker Street Victorian Crime Scene in Scarlet -->
      <defs>
        <radialGradient id="scarletGlow" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#4A0E13" />
          <stop offset="50%" stop-color="#1C0507" />
          <stop offset="100%" stop-color="#0A0203" />
        </radialGradient>
      </defs>
      <rect width="600" height="900" fill="url(#scarletGlow)" />
      <!-- Splattered Scarlet motif & Victorian Keyhole -->
      <g opacity="0.3">
        <circle cx="300" cy="420" r="160" stroke="#E63946" stroke-width="1.5" fill="none" stroke-dasharray="8 6" />
        <circle cx="300" cy="420" r="180" stroke="#E63946" stroke-width="0.75" fill="none" />
      </g>
      <!-- Blood-red RACHE text silhouette -->
      <text x="300" y="440" font-family="serif" font-size="58" font-weight="900" fill="#E63946" opacity="0.85" text-anchor="middle" letter-spacing="14" filter="drop-shadow(0 0 15px rgba(230,57,70,0.7))">RACHE</text>
      <!-- Victorian Magnifying glass & London street outline -->
      <g stroke="#F8F9FA" opacity="0.8" stroke-width="2" fill="none">
        <circle cx="300" cy="420" r="95" stroke-width="4" stroke="#E63946" />
        <line x1="367" y1="487" x2="435" y2="555" stroke-width="9" stroke="#E63946" stroke-linecap="round" />
        <line x1="375" y1="495" x2="440" y2="560" stroke-width="3" stroke="#FFF" stroke-linecap="round" />
      </g>
    `
  },
  {
    filename: 'the-hobbit-cover.webp',
    title: "The Hobbit",
    author: "J.R.R. Tolkien",
    subtitle: "THERE AND BACK AGAIN // 1937",
    palette: {
      bg: '#0E1711',
      accent: '#E9C46A',
      secondary: '#1A3323',
      text: '#F4F1DE',
      glow: 'rgba(233, 196, 106, 0.4)',
    },
    art: `
      <!-- Lonely Mountain, Smaug Flight & Round Hobbit Door -->
      <defs>
        <radialGradient id="hobbitSky" cx="50%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#4A6B4E" stop-opacity="0.8" />
          <stop offset="40%" stop-color="#1B3322" />
          <stop offset="100%" stop-color="#080F0A" />
        </radialGradient>
      </defs>
      <rect width="600" height="900" fill="url(#hobbitSky)" />
      <!-- Lonely Mountain Peaks -->
      <polygon points="300,210 160,490 440,490" fill="#132419" />
      <polygon points="300,210 260,330 300,310 320,350 340,300" fill="#2E4A35" />
      <!-- Golden Dragon silhouette circling peak -->
      <path d="M260,180 Q300,150 340,175 Q320,165 300,170 Q275,175 260,180 Z" fill="#E9C46A" filter="drop-shadow(0 0 10px #E9C46A)" />
      <!-- Green hill base -->
      <path d="M-50,600 Q300,480 650,600 L650,900 L-50,900 Z" fill="#0C140D" />
      <!-- Round Hobbit Door with brass knob -->
      <g transform="translate(300, 560)">
        <circle cx="0" cy="0" r="70" fill="#2D4D36" stroke="#E9C46A" stroke-width="4" />
        <circle cx="0" cy="0" r="62" fill="#182E1F" stroke="#E9C46A" stroke-width="1.5" stroke-dasharray="6 4" />
        <circle cx="0" cy="0" r="10" fill="#E9C46A" filter="drop-shadow(0 0 8px rgba(233,196,106,0.8))" />
      </g>
    `
  },
  {
    filename: '1984-george-orwell-cover.webp',
    title: "1984",
    author: "George Orwell",
    subtitle: "WAR IS PEACE // FREEDOM IS SLAVERY",
    palette: {
      bg: '#141416',
      accent: '#FF3B30',
      secondary: '#2C2C2E',
      text: '#E5E5EA',
      glow: 'rgba(255, 59, 48, 0.45)',
    },
    art: `
      <!-- All-Seeing Surveillance Eye & Brutalist Architecture -->
      <defs>
        <radialGradient id="eyeGlow" cx="50%" cy="42%" r="55%">
          <stop offset="0%" stop-color="#3A1010" />
          <stop offset="60%" stop-color="#141416" />
          <stop offset="100%" stop-color="#080809" />
        </radialGradient>
      </defs>
      <rect width="600" height="900" fill="url(#eyeGlow)" />
      <!-- Surveillance Beam Rays -->
      <polygon points="300,380 0,750 600,750" fill="#FF3B30" opacity="0.08" />
      <!-- Giant Stylized Eye of Big Brother -->
      <g transform="translate(300, 380)">
        <path d="M-150,0 Q0,-90 150,0 Q0,90 -150,0 Z" fill="#0E0E10" stroke="#FF3B30" stroke-width="4" filter="drop-shadow(0 0 16px rgba(255,59,48,0.5))" />
        <circle cx="0" cy="0" r="48" fill="#1A1A1E" stroke="#FF3B30" stroke-width="2" />
        <circle cx="0" cy="0" r="24" fill="#FF3B30" />
        <circle cx="-6" cy="-6" r="6" fill="#FFF" />
      </g>
      <!-- Brutalist Pyramid of Ministry of Truth -->
      <polygon points="300,520 180,680 420,680" fill="#1C1C20" stroke="#FF3B30" stroke-width="1.5" />
      <text x="300" y="620" font-family="monospace" font-size="20" font-weight="900" fill="#FF3B30" text-anchor="middle" letter-spacing="6">BIG BROTHER IS WATCHING</text>
    `
  },
  {
    filename: 'the-great-gatsby-cover.webp',
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    subtitle: "AN AMERICAN TRAGEDY // 1925",
    palette: {
      bg: '#080C14',
      accent: '#E5C07B',
      secondary: '#1A2333',
      text: '#F8F9FA',
      glow: 'rgba(229, 192, 123, 0.45)',
    },
    art: `
      <!-- Art Deco Skyline & Green Light Across Long Island Sound -->
      <defs>
        <radialGradient id="gatsbyGlow" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#1B2838" />
          <stop offset="55%" stop-color="#0C131D" />
          <stop offset="100%" stop-color="#04070B" />
        </radialGradient>
      </defs>
      <rect width="600" height="900" fill="url(#gatsbyGlow)" />
      <!-- Art Deco Geometric Arches -->
      <g stroke="#E5C07B" stroke-width="1.5" fill="none" opacity="0.4">
        <path d="M150,460 C150,280 450,280 450,460" />
        <path d="M180,460 C180,310 420,310 420,460" />
        <path d="M210,460 C210,340 390,340 390,460" />
        <line x1="300" y1="260" x2="300" y2="460" />
        <line x1="150" y1="460" x2="450" y2="460" />
      </g>
      <!-- Art Deco Manhattan Skyscrapers -->
      <g fill="#070A0F" opacity="0.95">
        <rect x="260" y="320" width="80" height="260" />
        <polygon points="300,260 275,320 325,320" />
        <rect x="180" y="360" width="60" height="220" />
        <rect x="360" y="370" width="65" height="210" />
        <rect x="110" y="410" width="55" height="170" />
        <rect x="440" y="400" width="50" height="180" />
      </g>
      <!-- Water reflection line -->
      <line x1="0" y1="580" x2="600" y2="580" stroke="#E5C07B" stroke-width="1" opacity="0.5" />
      <!-- The Green Light across the bay -->
      <circle cx="300" cy="565" r="7" fill="#00FF88" filter="drop-shadow(0 0 15px #00FF88)" />
      <ellipse cx="300" cy="585" rx="35" ry="3" fill="#00FF88" opacity="0.6" filter="drop-shadow(0 0 8px #00FF88)" />
    `
  },
  {
    filename: 'pride-and-prejudice-cover.webp',
    title: "Pride and Prejudice",
    author: "Jane Austen",
    subtitle: "A REGENCY MASTERPIECE // 1813",
    palette: {
      bg: '#141214',
      accent: '#E29578',
      secondary: '#2E2428',
      text: '#F7EDE2',
      glow: 'rgba(226, 149, 120, 0.4)',
    },
    art: `
      <!-- Regency Estate Manor, English Garden & Romantic Silhouette -->
      <defs>
        <radialGradient id="austenSky" cx="50%" cy="35%" r="60%">
          <stop offset="0%" stop-color="#4A343D" />
          <stop offset="50%" stop-color="#1F171B" />
          <stop offset="100%" stop-color="#0B090A" />
        </radialGradient>
      </defs>
      <rect width="600" height="900" fill="url(#austenSky)" />
      <!-- Pemberley Georgian Manor Silhouette -->
      <g fill="#120D10" opacity="0.8">
        <rect x="150" y="380" width="300" height="140" />
        <polygon points="300,320 220,380 380,380" />
        <!-- Georgian Pillars -->
        <line x1="250" y1="380" x2="250" y2="520" stroke="#E29578" stroke-width="2" opacity="0.4" />
        <line x1="280" y1="380" x2="280" y2="520" stroke="#E29578" stroke-width="2" opacity="0.4" />
        <line x1="320" y1="380" x2="320" y2="520" stroke="#E29578" stroke-width="2" opacity="0.4" />
        <line x1="350" y1="380" x2="350" y2="520" stroke="#E29578" stroke-width="2" opacity="0.4" />
      </g>
      <!-- Ornate Regency Cameo Oval -->
      <ellipse cx="300" cy="400" rx="140" ry="170" fill="none" stroke="#E29578" stroke-width="2" stroke-dasharray="10 6" />
      <ellipse cx="300" cy="400" rx="148" ry="178" fill="none" stroke="#E29578" stroke-width="0.75" />
    `
  },
  {
    filename: 'alices-adventures-in-wonderland-cover.webp',
    title: "Alice's Adventures in Wonderland",
    author: "Lewis Carroll",
    subtitle: "DOWN THE RABBIT-HOLE // 1865",
    palette: {
      bg: '#0F0B1A',
      accent: '#00E5FF',
      secondary: '#3A145E',
      text: '#F5F5F7',
      glow: 'rgba(0, 229, 255, 0.45)',
    },
    art: `
      <!-- Surreal Checkerboard Vortex, Pocket Watch & Cheshire Smile -->
      <defs>
        <radialGradient id="wonderlandVortex" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stop-color="#4C1A80" />
          <stop offset="45%" stop-color="#1B0C30" />
          <stop offset="100%" stop-color="#06030B" />
        </radialGradient>
      </defs>
      <rect width="600" height="900" fill="url(#wonderlandVortex)" />
      <!-- Pocket watch circle -->
      <g transform="translate(300, 400)">
        <circle cx="0" cy="0" r="110" fill="none" stroke="#00E5FF" stroke-width="3" filter="drop-shadow(0 0 14px rgba(0,229,255,0.6))" />
        <circle cx="0" cy="0" r="95" fill="none" stroke="#00E5FF" stroke-width="1" stroke-dasharray="8 6" />
        <!-- Roman numerals positions -->
        <circle cx="0" cy="-75" r="3" fill="#00E5FF" />
        <circle cx="75" cy="0" r="3" fill="#00E5FF" />
        <circle cx="0" cy="75" r="3" fill="#00E5FF" />
        <circle cx="-75" cy="0" r="3" fill="#00E5FF" />
        <!-- Watch hands spinning crazy -->
        <line x1="0" y1="0" x2="35" y2="-45" stroke="#00E5FF" stroke-width="3" stroke-linecap="round" />
        <line x1="0" y1="0" x2="-55" y2="25" stroke="#00E5FF" stroke-width="2" stroke-linecap="round" />
        <circle cx="0" cy="0" r="6" fill="#00E5FF" />
      </g>
      <!-- Cheshire Cat glowing crescent grin -->
      <path d="M220,550 Q300,600 380,550 Q300,575 220,550 Z" fill="#00E5FF" opacity="0.85" filter="drop-shadow(0 0 12px #00E5FF)" />
    `
  },
  {
    filename: 'frankenstein-mary-shelley-cover.webp',
    title: "Frankenstein",
    author: "Mary Shelley",
    subtitle: "THE MODERN PROMETHEUS // 1818",
    palette: {
      bg: '#0A1210',
      accent: '#52B788',
      secondary: '#1B3D30',
      text: '#D8F3DC',
      glow: 'rgba(82, 183, 136, 0.45)',
    },
    art: `
      <!-- Gothic Laboratory, Galvanic Spark & Creature Silhouette -->
      <defs>
        <radialGradient id="galvanicGlow" cx="50%" cy="38%" r="60%">
          <stop offset="0%" stop-color="#2D5A46" />
          <stop offset="50%" stop-color="#11221A" />
          <stop offset="100%" stop-color="#050B08" />
        </radialGradient>
      </defs>
      <rect width="600" height="900" fill="url(#galvanicGlow)" />
      <!-- Galvanic Electrical Arc -->
      <path d="M300,160 L315,280 L280,330 L325,410 L270,480 L300,560" stroke="#74C69D" stroke-width="3" fill="none" filter="drop-shadow(0 0 16px #52B788)" />
      <path d="M300,160 L315,280 L280,330 L325,410 L270,480 L300,560" stroke="#FFF" stroke-width="1" fill="none" opacity="0.9" />
      <!-- Giant brooding Creature silhouette -->
      <path d="M220,620 C220,520 250,470 300,470 C350,470 380,520 380,620 Z" fill="#060E0B" />
      <circle cx="300" cy="445" r="45" fill="#060E0B" />
      <!-- Glowing animate spark in heart -->
      <circle cx="300" cy="540" r="8" fill="#74C69D" filter="drop-shadow(0 0 14px #74C69D)" />
    `
  },
  {
    filename: 'dracula-bram-stoker-cover.webp',
    title: "Dracula",
    author: "Bram Stoker",
    subtitle: "A TALE OF THE UN-DEAD // 1897",
    palette: {
      bg: '#120406',
      accent: '#9D0208',
      secondary: '#370617',
      text: '#F5F3F4',
      glow: 'rgba(157, 2, 8, 0.5)',
    },
    art: `
      <!-- Carpathian Castle, Blood-Red Full Moon & Bats -->
      <defs>
        <radialGradient id="draculaMoon" cx="50%" cy="35%" r="60%">
          <stop offset="0%" stop-color="#6A040F" />
          <stop offset="45%" stop-color="#240206" />
          <stop offset="100%" stop-color="#080102" />
        </radialGradient>
      </defs>
      <rect width="600" height="900" fill="url(#draculaMoon)" />
      <!-- Blood Moon -->
      <circle cx="300" cy="320" r="90" fill="#9D0208" opacity="0.85" filter="drop-shadow(0 0 30px #6A040F)" />
      <!-- Jagged Carpathian Castle Spires -->
      <g fill="#070102">
        <polygon points="300,280 270,520 330,520" />
        <polygon points="240,340 220,530 260,530" />
        <polygon points="360,330 340,530 380,530" />
        <polygon points="180,390 160,550 200,550" />
        <polygon points="420,380 400,550 440,550" />
        <path d="M0,520 Q300,470 600,520 L600,900 L0,900 Z" />
      </g>
      <!-- Bats in flight -->
      <path d="M240,240 Q250,230 260,240 Q250,245 240,240 Z" fill="#000" />
      <path d="M340,220 Q355,208 370,220 Q355,226 340,220 Z" fill="#000" />
      <path d="M290,190 Q305,178 320,190 Q305,196 290,190 Z" fill="#000" />
    `
  },
  {
    filename: 'jane-eyre-cover.webp',
    title: "Jane Eyre",
    author: "Charlotte Brontë",
    subtitle: "AN AUTOBIOGRAPHY // 1847",
    palette: {
      bg: '#141417',
      accent: '#C9A227',
      secondary: '#25252B',
      text: '#F0EFF4',
      glow: 'rgba(201, 162, 39, 0.4)',
    },
    art: `
      <!-- Thornfield Hall Silhouette, Wuthering Moors & Solitary Governess -->
      <defs>
        <radialGradient id="eyreSky" cx="50%" cy="35%" r="60%">
          <stop offset="0%" stop-color="#3A3845" />
          <stop offset="50%" stop-color="#1B1A22" />
          <stop offset="100%" stop-color="#0B0B0E" />
        </radialGradient>
      </defs>
      <rect width="600" height="900" fill="url(#eyreSky)" />
      <!-- Thornfield Manor silhouette with attic window lit -->
      <g fill="#0E0D12">
        <rect x="180" y="340" width="240" height="180" />
        <polygon points="300,270 180,340 420,340" />
        <!-- Attic window lit with amber lantern -->
        <rect x="290" y="300" width="20" height="25" fill="#C9A227" filter="drop-shadow(0 0 12px #C9A227)" />
      </g>
      <!-- Bleak Moorland Horizon -->
      <path d="M0,540 Q180,490 350,530 T600,520 L600,900 L0,900 Z" fill="#070709" />
      <!-- Solitary Jane figure on the moor -->
      <g fill="#070709" transform="translate(180, 480)">
        <path d="M0,45 C0,30 8,25 15,25 C22,25 30,30 30,45 Z" />
        <circle cx="15" cy="18" r="7" />
      </g>
    `
  },
  {
    filename: 'moby-dick-cover.webp',
    title: "Moby-Dick",
    author: "Herman Melville",
    subtitle: "THE WHALE // 1851",
    palette: {
      bg: '#05121A',
      accent: '#48CAE4',
      secondary: '#003049',
      text: '#EDF6F9',
      glow: 'rgba(72, 202, 228, 0.45)',
    },
    art: `
      <!-- Giant White Whale Breach & Turbulent Atlantic Ocean -->
      <defs>
        <radialGradient id="oceanGlow" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stop-color="#004E64" />
          <stop offset="45%" stop-color="#002538" />
          <stop offset="100%" stop-color="#020C12" />
        </radialGradient>
      </defs>
      <rect width="600" height="900" fill="url(#oceanGlow)" />
      <!-- Whale Tail Breach (Fluke) Silhouette -->
      <g fill="#EDF6F9" opacity="0.9" filter="drop-shadow(0 0 20px rgba(72,202,228,0.5))">
        <path d="M300,320 C270,220 180,180 140,200 C180,240 240,280 280,380 C320,280 380,240 420,200 C380,180 290,220 260,320 Z" />
        <rect x="285" y="320" width="30" height="180" />
      </g>
      <!-- Raging Ocean Waves -->
      <path d="M0,520 Q150,470 300,510 T600,490 L600,900 L0,900 Z" fill="#001824" />
      <path d="M0,560 Q200,510 400,550 T600,530 L600,900 L0,900 Z" fill="#000F17" />
      <!-- Harpoon lines -->
      <line x1="220" y1="280" x2="380" y2="580" stroke="#48CAE4" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.6" />
    `
  },
  {
    filename: 'picture-of-dorian-gray-cover.webp',
    title: "The Picture of Dorian Gray",
    author: "Oscar Wilde",
    subtitle: "AN ESSAY IN AESTHETICISM // 1890",
    palette: {
      bg: '#140E14',
      accent: '#D4AF37',
      secondary: '#361D32',
      text: '#F1E9DB',
      glow: 'rgba(212, 175, 55, 0.45)',
    },
    art: `
      <!-- Ornate Victorian Golden Portrait Frame & Duality Split -->
      <defs>
        <radialGradient id="dorianGlow" cx="50%" cy="38%" r="60%">
          <stop offset="0%" stop-color="#472638" />
          <stop offset="50%" stop-color="#1A0F17" />
          <stop offset="100%" stop-color="#090508" />
        </radialGradient>
      </defs>
      <rect width="600" height="900" fill="url(#dorianGlow)" />
      <!-- Ornate Heavy Baroque Picture Frame -->
      <rect x="140" y="220" width="320" height="420" rx="12" fill="#0A0609" stroke="#D4AF37" stroke-width="6" filter="drop-shadow(0 0 25px rgba(212,175,55,0.4))" />
      <rect x="155" y="235" width="290" height="390" rx="8" fill="none" stroke="#D4AF37" stroke-width="1.5" stroke-dasharray="8 6" />
      <!-- Duality Face Silhouette: Pristine Left / Shadow Decay Right -->
      <g transform="translate(300, 420)">
        <!-- Left: Youthful profile -->
        <path d="M0,-100 C-60,-100 -80,-40 -80,20 C-80,80 -50,110 0,120 Z" fill="#D4AF37" opacity="0.3" />
        <!-- Right: Corrupted jagged split -->
        <path d="M0,-100 C40,-90 70,-30 65,30 C60,75 35,105 0,120 Z" fill="#7D1935" opacity="0.45" />
        <line x1="0" y1="-110" x2="0" y2="130" stroke="#D4AF37" stroke-width="2" />
      </g>
    `
  },
  {
    filename: 'count-of-monte-cristo-cover.webp',
    title: "The Count of Monte Cristo",
    author: "Alexandre Dumas",
    subtitle: "A SAGA OF REVENGE // 1844",
    palette: {
      bg: '#0E1118',
      accent: '#E0A96D',
      secondary: '#202838',
      text: '#F5F5F7',
      glow: 'rgba(224, 169, 109, 0.45)',
    },
    art: `
      <!-- Château d'If Island Fortress, Mediterranean Sea & Retribution Sword -->
      <defs>
        <radialGradient id="cristoSky" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#2D3A52" />
          <stop offset="50%" stop-color="#141B26" />
          <stop offset="100%" stop-color="#080B10" />
        </radialGradient>
      </defs>
      <rect width="600" height="900" fill="url(#cristoSky)" />
      <!-- Château d'If Rock Island & Fortress Ramparts -->
      <g fill="#0A0E14">
        <!-- Island rock base -->
        <polygon points="120,530 220,440 380,440 480,530" />
        <!-- Fortress walls & towers -->
        <rect x="230" y="370" width="140" height="70" />
        <polygon points="210,340 250,340 245,390 215,390" />
        <polygon points="350,340 390,340 385,390 355,390" />
      </g>
      <!-- Sea swells -->
      <path d="M0,520 Q160,490 300,515 T600,510 L600,900 L0,900 Z" fill="#06080C" />
      <!-- Upright Rapier / Dueling Sword Motif -->
      <line x1="300" y1="200" x2="300" y2="600" stroke="#E0A96D" stroke-width="3" filter="drop-shadow(0 0 10px #E0A96D)" />
      <line x1="270" y1="240" x2="330" y2="240" stroke="#E0A96D" stroke-width="4" />
      <circle cx="300" cy="195" r="7" fill="#E0A96D" />
    `
  },
  {
    filename: 'the-little-prince-cover.webp',
    title: "The Little Prince",
    author: "Antoine de Saint-Exupéry",
    subtitle: "LE PETIT PRINCE // 1943",
    palette: {
      bg: '#0A0C16',
      accent: '#FFD166',
      secondary: '#1A2138',
      text: '#F8F9FA',
      glow: 'rgba(255, 209, 102, 0.5)',
    },
    art: `
      <!-- Asteroid B 612, Golden Scarf Silhouette & Cosmic Rose -->
      <defs>
        <radialGradient id="princeCosmos" cx="50%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#24305E" />
          <stop offset="50%" stop-color="#0E1326" />
          <stop offset="100%" stop-color="#05060D" />
        </radialGradient>
      </defs>
      <rect width="600" height="900" fill="url(#princeCosmos)" />
      <!-- Star Constellations -->
      <g fill="#FFF" opacity="0.8">
        <circle cx="90" cy="110" r="2" fill="#FFD166" />
        <circle cx="170" cy="80" r="1.5" />
        <circle cx="480" cy="120" r="2.5" fill="#FFD166" filter="drop-shadow(0 0 6px #FFD166)" />
        <circle cx="520" cy="210" r="1.5" />
        <circle cx="380" cy="90" r="2" />
        <circle cx="280" cy="140" r="1" />
      </g>
      <!-- Tiny Asteroid B 612 Sphere -->
      <circle cx="300" cy="620" r="160" fill="#141A2E" stroke="#FFD166" stroke-width="2" />
      <!-- Little Prince figure atop asteroid -->
      <g fill="#FFD166" transform="translate(290, 410)">
        <circle cx="10" cy="0" r="10" />
        <path d="M0,12 L20,12 L16,48 L4,48 Z" />
        <!-- Floating Golden Scarf in the cosmic wind -->
        <path d="M15,14 Q40,6 65,18 Q40,24 15,18 Z" fill="#FFD166" filter="drop-shadow(0 0 10px #FFD166)" />
      </g>
      <!-- The Single Red Rose in glass bell jar -->
      <g transform="translate(380, 435)">
        <ellipse cx="0" cy="15" rx="14" ry="22" fill="none" stroke="#FFF" stroke-width="1.5" opacity="0.7" />
        <circle cx="0" cy="15" r="6" fill="#EF476F" filter="drop-shadow(0 0 8px #EF476F)" />
      </g>
    `
  }
];

async function generateAllCovers() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 600, height: 900 } });

  const targetDirs = [
    '/Users/mohdfaizankhan/SyncTone-/novel-audio-synthesizer/output/covers',
    '/Users/mohdfaizankhan/SyncTone-/novel-audio-synthesizer/frontend/public/covers',
  ];

  targetDirs.forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  for (const item of COVERS) {
    console.log(`Generating cover for "${item.title}"...`);
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=JetBrains+Mono:wght@400;700;800&family=Inter:wght@400;600;800&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            width: 600px;
            height: 900px;
            overflow: hidden;
            background: ${item.palette.bg};
            color: ${item.palette.text};
            font-family: 'Cinzel', serif;
            position: relative;
          }
          .art-bg {
            position: absolute;
            top: 0; left: 0; width: 600px; height: 900px;
            z-index: 1;
          }
          .overlay-frame {
            position: absolute;
            top: 24px; left: 24px; right: 24px; bottom: 24px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            pointer-events: none;
            z-index: 5;
          }
          .inner-corner {
            position: absolute; width: 12px; height: 12px;
            border-color: ${item.palette.accent};
          }
          .tl { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; }
          .tr { top: -1px; right: -1px; border-top: 2px solid; border-right: 2px solid; }
          .bl { bottom: -1px; left: -1px; border-bottom: 2px solid; border-left: 2px solid; }
          .br { bottom: -1px; right: -1px; border-bottom: 2px solid; border-right: 2px solid; }
          
          .content-stage {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 50px 45px 55px;
            z-index: 10;
            text-align: center;
          }
          .eyebrow {
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.25em;
            text-transform: uppercase;
            color: ${item.palette.accent};
            opacity: 0.95;
            text-shadow: 0 0 10px ${item.palette.glow};
          }
          .brand-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid rgba(255, 255, 255, 0.18);
            padding-bottom: 12px;
            margin-bottom: 10px;
          }
          .brand-badge {
            font-family: 'JetBrains Mono', monospace;
            font-size: 9px;
            letter-spacing: 0.15em;
            text-transform: uppercase;
            padding: 3px 10px;
            border-radius: 9999px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #F0F0F3;
          }
          .title-box {
            margin-top: 15px;
          }
          .book-title {
            font-size: 32px;
            line-height: 1.15;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: #FFFFFF;
            text-shadow: 0 4px 18px rgba(0, 0, 0, 0.9), 0 0 25px ${item.palette.glow};
          }
          .footer-box {
            border-top: 1px solid rgba(255, 255, 255, 0.18);
            padding-top: 18px;
          }
          .author-label {
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            letter-spacing: 0.2em;
            text-transform: uppercase;
            color: #A9A9AF;
            margin-bottom: 6px;
          }
          .author-name {
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: ${item.palette.accent};
            text-shadow: 0 2px 12px rgba(0, 0, 0, 0.8);
          }
        </style>
      </head>
      <body>
        <div class="art-bg">
          <svg width="600" height="900" viewBox="0 0 600 900" xmlns="http://www.w3.org/2000/svg">
            ${item.art}
          </svg>
        </div>
        <div class="overlay-frame">
          <div class="inner-corner tl"></div>
          <div class="inner-corner tr"></div>
          <div class="inner-corner bl"></div>
          <div class="inner-corner br"></div>
        </div>
        <div class="content-stage">
          <div>
            <div class="brand-row">
              <span class="brand-badge">SYNCTONE CLASSICS</span>
              <span class="eyebrow">${item.subtitle}</span>
            </div>
            <div class="title-box">
              <h1 class="book-title">${item.title}</h1>
            </div>
          </div>
          <div class="footer-box">
            <div class="author-label">WRITTEN BY</div>
            <div class="author-name">${item.author}</div>
          </div>
        </div>
      </body>
      </html>
    `;

    await page.setContent(html);
    await page.waitForTimeout(100);

    for (const dir of targetDirs) {
      const destPath = path.join(dir, item.filename);
      await page.screenshot({ path: destPath, type: 'webp', quality: 92 });
      // Also generate a .jpg fallback with the same stem
      const jpgPath = destPath.replace('.webp', '.jpg');
      await page.screenshot({ path: jpgPath, type: 'jpeg', quality: 92 });
    }
  }

  await browser.close();
  console.log(`✓ All ${COVERS.length} covers generated successfully.`);
}

generateAllCovers().catch(console.error);

