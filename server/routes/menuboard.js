// routes/menuboard.js  (v2 — with image upload support)
// Requires: npm install multer
// Mount: app.use('/api/menuboard', require('./routes/menuboard'));

const express = require('express');
const router  = express.Router();
const { Pool } = require('pg');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const pool = new Pool({
  host: 'localhost', database: 'pizzapos',
  user: 'pizzapos', password: 'pizzapos', port: 5432,
});

// ── Upload config ─────────────────────────────────────────
const UPLOAD_DIR = '/var/www/pizza-time-pos/uploads/menuboard';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${req.body.slot || 'image'}-${Date.now()}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|webp|gif/.test(file.mimetype);
    cb(ok ? null : new Error('Images only'), ok);
  },
});

// ── GET /api/menuboard ────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [settings, wholePizzas, specialtyNote, wholeToppings, addons, slices, sicilian, sides, images] =
      await Promise.all([
        pool.query('SELECT * FROM menuboard_settings LIMIT 1'),
        pool.query('SELECT * FROM menuboard_whole_pizza WHERE active=true ORDER BY sort_order'),
        pool.query('SELECT * FROM menuboard_specialty_note LIMIT 1'),
        pool.query('SELECT * FROM menuboard_whole_toppings LIMIT 1'),
        pool.query('SELECT * FROM menuboard_addons LIMIT 1'),
        pool.query('SELECT * FROM menuboard_slices WHERE active=true ORDER BY sort_order'),
        pool.query('SELECT * FROM menuboard_sicilian LIMIT 1'),
        pool.query('SELECT * FROM menuboard_sides WHERE active=true ORDER BY sort_order'),
        pool.query('SELECT * FROM menuboard_images'),
      ]);

    // Build images map: { round: '/uploads/menuboard/round-123.jpg', ... }
    const imageMap = {};
    images.rows.forEach(r => {
      imageMap[r.slot] = r.filename ? `/uploads/menuboard/${r.filename}` : null;
    });

    res.json({
      settings: settings.rows[0],
      wholePizzas: wholePizzas.rows,
      specialtyNote: specialtyNote.rows[0]?.note || '',
      wholeToppings: wholeToppings.rows[0],
      addons: addons.rows[0],
      slices: slices.rows,
      sicilian: sicilian.rows[0],
      sides: sides.rows,
      images: imageMap,
    });
  } catch (err) {
    console.error('menuboard GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/menuboard ────────────────────────────────────
router.put('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { settings, wholePizzas, specialtyNote, wholeToppings, addons, slices, sicilian, sides } = req.body;

    if (settings) await client.query(
      `UPDATE menuboard_settings SET store_name=$1, tagline=$2, fresh_basil_note=$3 WHERE id=$4`,
      [settings.store_name, settings.tagline, settings.fresh_basil_note, settings.id]
    );
    if (specialtyNote !== undefined) await client.query(
      `UPDATE menuboard_specialty_note SET note=$1 WHERE id=1`, [specialtyNote]
    );
    if (Array.isArray(wholePizzas)) for (const p of wholePizzas) {
      if (p.id) await client.query(
        `UPDATE menuboard_whole_pizza SET label=$1,price=$2,sort_order=$3,active=$4 WHERE id=$5`,
        [p.label, p.price, p.sort_order, p.active !== false, p.id]
      ); else await client.query(
        `INSERT INTO menuboard_whole_pizza(label,price,sort_order,active) VALUES($1,$2,$3,$4)`,
        [p.label, p.price, p.sort_order||0, p.active !== false]
      );
    }
    if (wholeToppings) await client.query(
      `UPDATE menuboard_whole_toppings SET price_each=$1,items=$2 WHERE id=$3`,
      [wholeToppings.price_each, wholeToppings.items, wholeToppings.id]
    );
    if (addons) await client.query(
      `UPDATE menuboard_addons SET price_each=$1,items=$2 WHERE id=$3`,
      [addons.price_each, addons.items, addons.id]
    );
    if (Array.isArray(slices)) for (const s of slices) {
      if (s.id) await client.query(
        `UPDATE menuboard_slices SET label=$1,price=$2,sort_order=$3,active=$4 WHERE id=$5`,
        [s.label, s.price, s.sort_order, s.active !== false, s.id]
      ); else await client.query(
        `INSERT INTO menuboard_slices(label,price,sort_order,active) VALUES($1,$2,$3,$4)`,
        [s.label, s.price, s.sort_order||0, s.active !== false]
      );
    }
    if (sicilian) await client.query(
      `UPDATE menuboard_sicilian SET header=$1,topping_price=$2,topping_limit=$3,items=$4 WHERE id=$5`,
      [sicilian.header, sicilian.topping_price, sicilian.topping_limit, JSON.stringify(sicilian.items), sicilian.id]
    );
    if (Array.isArray(sides)) for (const s of sides) {
      if (s.id) await client.query(
        `UPDATE menuboard_sides SET label=$1,price=$2,sort_order=$3,active=$4 WHERE id=$5`,
        [s.label, s.price, s.sort_order, s.active !== false, s.id]
      ); else await client.query(
        `INSERT INTO menuboard_sides(label,price,sort_order,active) VALUES($1,$2,$3,$4)`,
        [s.label, s.price, s.sort_order||0, s.active !== false]
      );
    }

    await client.query('COMMIT');
    if (req.app.get('io')) req.app.get('io').emit('menuboard:update');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── POST /api/menuboard/upload ────────────────────────────
// Body: multipart/form-data with fields: slot (text), image (file)
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const { slot } = req.body;
    if (!slot) return res.status(400).json({ error: 'slot required' });
    if (!req.file) return res.status(400).json({ error: 'no file' });

    // Delete old file if exists
    const old = await pool.query('SELECT filename FROM menuboard_images WHERE slot=$1', [slot]);
    if (old.rows[0]?.filename) {
      const oldPath = path.join(UPLOAD_DIR, old.rows[0].filename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    // Upsert new filename
    await pool.query(
      `INSERT INTO menuboard_images(slot, filename) VALUES($1,$2)
       ON CONFLICT(slot) DO UPDATE SET filename=$2, updated_at=NOW()`,
      [slot, req.file.filename]
    );

    if (req.app.get('io')) req.app.get('io').emit('menuboard:update');
    res.json({ success: true, url: `/uploads/menuboard/${req.file.filename}` });
  } catch (err) {
    console.error('upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/menuboard/image/:slot ─────────────────────
router.delete('/image/:slot', async (req, res) => {
  try {
    const { slot } = req.params;
    const old = await pool.query('SELECT filename FROM menuboard_images WHERE slot=$1', [slot]);
    if (old.rows[0]?.filename) {
      const oldPath = path.join(UPLOAD_DIR, old.rows[0].filename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    await pool.query(`UPDATE menuboard_images SET filename='', updated_at=NOW() WHERE slot=$1`, [slot]);
    if (req.app.get('io')) req.app.get('io').emit('menuboard:update');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE row helpers ────────────────────────────────────
router.delete('/whole-pizza/:id', async (req, res) => {
  await pool.query('DELETE FROM menuboard_whole_pizza WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});
router.delete('/slice/:id', async (req, res) => {
  await pool.query('DELETE FROM menuboard_slices WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});
router.delete('/side/:id', async (req, res) => {
  await pool.query('DELETE FROM menuboard_sides WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
