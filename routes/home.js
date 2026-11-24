const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  const [recipes] = await pool.query(
    `SELECT r.id, r.title, r.dose_g, r.water_g, r.overall, r.image_path,
            u.nickname, b.name AS bean_name, m.name AS method_name,
            (SELECT COUNT(*) FROM recipe_likes l WHERE l.recipe_id = r.id) AS like_count
     FROM recipes r
     JOIN users u ON u.id = r.user_id
     JOIN beans b ON b.id = r.bean_id
     JOIN brew_methods m ON m.id = r.method_id
     WHERE r.is_public = 1 ORDER BY r.id DESC LIMIT 6`);
  const [[stats]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM recipes WHERE is_public = 1) AS recipes,
            (SELECT COUNT(*) FROM users) AS users,
            (SELECT COUNT(*) FROM cafes) AS cafes`);
  res.render('index', { title: '커피 추출 연구소', recipes, stats });
});

module.exports = router;
