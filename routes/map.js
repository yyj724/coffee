const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  const [cafes] = await pool.query(
    `SELECT id, name, city, country, lat, lng, opened_year, category, signature, description, image_path, source_url
     FROM cafes ORDER BY (opened_year IS NULL), opened_year, id`);
  res.render('map', { title: '커피 지도', cafes });
});

module.exports = router;
