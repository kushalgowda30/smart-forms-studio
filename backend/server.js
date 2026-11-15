const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL database connection pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'smartforms_db',
  password: 'your_password',
  port: 5432,
});

// Check database connection on startup
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error connecting to PostgreSQL:', err.message);
  }
  console.log('Successfully connected to PostgreSQL (smartforms_db)');
  release();
});

/* ==========================================
   API ROUTES
   ========================================== */

// 1. Fetch all forms
app.get('/api/forms', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM forms ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch forms' });
  }
});

// 2. Create a form
app.post('/api/forms', async (req, res) => {
  const {
    id, name, createdBy, status, includeHeadlineDesc,
    hasHeadline, hasDescription, headline, description,
    questions, routes, destinationType, destination
  } = req.body;

  try {
    const query = `
      INSERT INTO forms (
        id, name, created_by, status, include_headline_desc,
        has_headline, has_description, headline, description,
        questions, routes, destination_type, destination
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `;
    const values = [
      id, name, createdBy || 'You', status || 'Published',
      Boolean(includeHeadlineDesc), Boolean(hasHeadline), Boolean(hasDescription),
      headline || '', description || '',
      JSON.stringify(questions || []), JSON.stringify(routes || []),
      destinationType || 'event', destination || ''
    ];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create form' });
  }
});

// 3. Update a form
app.put('/api/forms/:id', async (req, res) => {
  const { id } = req.params;
  const {
    name, includeHeadlineDesc, hasHeadline, hasDescription,
    headline, description, questions, routes, destinationType, destination
  } = req.body;

  try {
    const query = `
      UPDATE forms SET
        name = $1,
        include_headline_desc = $2,
        has_headline = $3,
        has_description = $4,
        headline = $5,
        description = $6,
        questions = $7,
        routes = $8,
        destination_type = $9,
        destination = $10
      WHERE id = $11
      RETURNING *;
    `;
    const values = [
      name, Boolean(includeHeadlineDesc), Boolean(hasHeadline), Boolean(hasDescription),
      headline || '', description || '',
      JSON.stringify(questions || []), JSON.stringify(routes || []),
      destinationType || 'event', destination || '', id
    ];

    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update form' });
  }
});

// 4. Delete a form
app.delete('/api/forms/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM forms WHERE id = $1', [id]);
    res.json({ message: 'Form deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete form' });
  }
});

// 5. Submit responses
app.post('/api/responses', async (req, res) => {
  const { form_id, name, email, phone, routed_to } = req.body;
  try {
    const query = `
      INSERT INTO responses (form_id, name, email, phone, routed_to)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const result = await pool.query(query, [form_id, name, email, phone, routed_to]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record response' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});