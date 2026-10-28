const { Router } = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { config } = require('../config');
const { authenticateUser } = require('../middleware/auth');

const router = Router();

const ALLOWED_ROLES = ['reader', 'writer', 'admin'];

/**
 * POST /api/auth/register
 * Validates input, hashes password via pgcrypto, and inserts user with parameterized query.
 */
router.post('/auth/register', async (req, res) => {
  try {
    const { username, email, password, role = 'reader' } = req.body;

    // Validation
    if (!username || typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50) {
      return res.status(400).json({
        error: 'Invalid username. Must be a string between 3 and 50 characters.',
      });
    }

    if (!email || typeof email !== 'string' || !email.includes('@') || email.trim().length > 255) {
      return res.status(400).json({
        error: 'Invalid email address.',
      });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters long.',
      });
    }

    let normalizedRole = (typeof role === 'string' && role.trim()) ? role.toLowerCase().trim() : 'reader';
    if (normalizedRole === 'author') {
      normalizedRole = 'writer';
    }
    if (!ALLOWED_ROLES.includes(normalizedRole)) {
      return res.status(400).json({
        error: `Invalid role. Allowed values: ${ALLOWED_ROLES.join(', ')}.`,
      });
    }
    if (normalizedRole === 'admin') {
      return res.status(403).json({
        error: 'Forbidden: public registration cannot grant admin privileges. Privileged roles must be assigned through an authorized backend workflow.',
      });
    }
    if (!['reader', 'writer'].includes(normalizedRole)) {
      return res.status(400).json({
        error: `Invalid role. Allowed public roles are: reader, writer (author).`,
      });
    }

    const query = `
      INSERT INTO users (username, email, password_hash, role)
      VALUES ($1, $2, crypt($3, gen_salt('bf')), $4)
      RETURNING id, username, email, role, created_at, updated_at;
    `;

    const result = await pool.query(query, [
      username.trim(),
      email.toLowerCase().trim(),
      password,
      normalizedRole,
    ]);

    const user = result.rows[0];

    return res.status(201).json({
      message: 'User registered successfully',
      user,
    });
  } catch (err) {
    // Unique constraint violation in PostgreSQL (23505)
    if (err.code === '23505') {
      const detail = err.detail || '';
      if (detail.includes('username')) {
        return res.status(409).json({ error: 'Username already taken.' });
      }
      if (detail.includes('email')) {
        return res.status(409).json({ error: 'Email already registered.' });
      }
      return res.status(409).json({ error: 'User already exists.' });
    }

    console.error('[Auth Register Error]:', err.message);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// Dummy bcrypt hash with work factor 6 (matching pgcrypto bf salt default)
// used to mitigate login timing differences when an email does not exist.
const DUMMY_BCRYPT_HASH = '$2a$06$3tytcF1XihQG2zITIeMbtemxngvfuTjVCkLiKJ2UHWxVeuPlg5EX2';

/**
 * POST /api/auth/login
 * Validates email/password against PostgreSQL and issues JWT cookie.
 */
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const query = `
      SELECT id, username, email, role,
             (password_hash = crypt($2, password_hash)) AS password_matches
      FROM users
      WHERE email = $1;
    `;

    const result = await pool.query(query, [email.toLowerCase().trim(), password]);

    if (result.rows.length === 0) {
      // Login timing mitigation: compute dummy crypt() against valid salt & matching work factor
      await pool.query('SELECT crypt($1, $2)', [password, DUMMY_BCRYPT_HASH]);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!result.rows[0].password_matches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const userRecord = result.rows[0];
    const userPayload = {
      id: userRecord.id,
      username: userRecord.username,
      email: userRecord.email,
      role: userRecord.role,
    };

    const token = jwt.sign(userPayload, config.jwtSecret, {
      expiresIn: '7d',
    });

    // Rule 1: Issue JWT as httpOnly, Secure (in production), SameSite=Lax cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({
      message: 'Login successful',
      token,
      user: userPayload,
    });
  } catch (err) {
    console.error('[Auth Login Error]:', err.message);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
});

/**
 * POST /api/auth/logout
 * Clears the authentication cookie.
 */
router.post('/auth/logout', (_req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
  });
  return res.json({ message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me
 * Returns current authenticated user session.
 */
router.get('/auth/me', authenticateUser, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
