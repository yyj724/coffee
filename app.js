require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 },
}));

// 모든 화면에서 쓰는 공통 값
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.currentPath = req.path;
  next();
});

app.use('/', require('./routes/home'));
app.use('/recipes', require('./routes/recipes'));
app.use('/recipes', require('./routes/social'));
app.use('/calculator', require('./routes/calculator'));
app.use('/', require('./routes/auth'));

app.use((req, res) => res.status(404).render('404', { title: '페이지를 찾을 수 없어요' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('서버 오류가 발생했어요. 터미널의 에러 로그를 확인해 주세요.');
});

app.listen(process.env.PORT || 3000, () => {
  console.log('서버 실행: http://localhost:' + (process.env.PORT || 3000));
});
