SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS recipe_likes, comments, trials, recipes, cafes, brew_methods, beans, users;
SET FOREIGN_KEY_CHECKS = 1;

-- 회원
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(30) NOT NULL UNIQUE,
  nickname VARCHAR(30) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 원두 마스터
CREATE TABLE beans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  origin VARCHAR(50) NOT NULL,
  roast_level ENUM('light','medium','dark') NOT NULL DEFAULT 'medium',
  process VARCHAR(30) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 추출 방식 마스터 (진단 엔진이 참고하는 기준 범위)
CREATE TABLE brew_methods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(30) NOT NULL UNIQUE,
  ratio_min DECIMAL(4,1) NOT NULL,
  ratio_max DECIMAL(4,1) NOT NULL,
  temp_min TINYINT NULL,
  temp_max TINYINT NULL,
  time_min_sec INT NOT NULL,
  time_max_sec INT NOT NULL,
  tip VARCHAR(200) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 레시피 (자기 참조: forked_from)
CREATE TABLE recipes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  bean_id INT NOT NULL,
  method_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  dose_g DECIMAL(5,1) NOT NULL,
  water_g DECIMAL(6,1) NOT NULL,
  water_temp_c TINYINT NULL,
  grind_level TINYINT NOT NULL DEFAULT 5,
  brew_time_sec INT NOT NULL,
  tds_pct DECIMAL(4,2) NULL,
  output_g DECIMAL(6,1) NULL,
  extraction_yield DECIMAL(4,1) NULL,
  sour TINYINT NOT NULL DEFAULT 3,
  sweet TINYINT NOT NULL DEFAULT 3,
  bitter TINYINT NOT NULL DEFAULT 3,
  body TINYINT NOT NULL DEFAULT 3,
  aroma TINYINT NOT NULL DEFAULT 3,
  overall TINYINT NOT NULL DEFAULT 3,
  note TEXT NULL,
  image_path VARCHAR(255) NULL,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  forked_from INT NULL,
  views INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (bean_id) REFERENCES beans(id),
  FOREIGN KEY (method_id) REFERENCES brew_methods(id),
  FOREIGN KEY (forked_from) REFERENCES recipes(id) ON DELETE SET NULL,
  CHECK (grind_level BETWEEN 1 AND 10),
  CHECK (sour BETWEEN 1 AND 5 AND sweet BETWEEN 1 AND 5 AND bitter BETWEEN 1 AND 5
         AND body BETWEEN 1 AND 5 AND aroma BETWEEN 1 AND 5 AND overall BETWEEN 1 AND 5),
  INDEX idx_recipes_created (created_at),
  INDEX idx_recipes_method (method_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 재현 결과 (따라 만들어 본 사람의 평가)
CREATE TABLE trials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recipe_id INT NOT NULL,
  user_id INT NOT NULL,
  overall TINYINT NOT NULL,
  sour TINYINT NOT NULL DEFAULT 3,
  bitter TINYINT NOT NULL DEFAULT 3,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_trial (recipe_id, user_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (overall BETWEEN 1 AND 5 AND sour BETWEEN 1 AND 5 AND bitter BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 댓글, 좋아요
CREATE TABLE comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recipe_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE recipe_likes (
  recipe_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (recipe_id, user_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 커피 지도: 세계 유명 커피 전문점
CREATE TABLE cafes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  city VARCHAR(50) NOT NULL,
  country VARCHAR(50) NOT NULL,
  lat DECIMAL(9,6) NOT NULL,
  lng DECIMAL(9,6) NOT NULL,
  opened_year SMALLINT NULL,
  category VARCHAR(30) NULL,
  signature VARCHAR(100) NULL,
  description TEXT NULL,
  image_path VARCHAR(255) NULL,
  source_url VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 기본 데이터: 추출 방식 (참고 기준, 관리자 화면에서 수정 가능하게 만들 예정)
INSERT INTO brew_methods (name, ratio_min, ratio_max, temp_min, temp_max, time_min_sec, time_max_sec, tip) VALUES
  ('핸드드립', 15.0, 17.0, 90, 96, 150, 210, '종이 필터로 깔끔한 맛. 뜸 들이기와 물줄기 속도가 맛을 좌우해요.'),
  ('에어로프레스', 12.0, 16.0, 80, 95, 60, 180, '압력으로 짧게 추출. 레시피 자유도가 높아요.'),
  ('프렌치프레스', 12.0, 16.0, 92, 96, 210, 270, '침출식. 바디감이 묵직하고 오일이 그대로 느껴져요.'),
  ('콜드브루', 5.0, 15.0, 4, 25, 43200, 86400, '찬물로 오래 우려요. 산미가 부드럽고 쓴맛이 적어요.');

-- 기본 데이터: 원두 (예시, 관리자 화면에서 추가·수정)
INSERT INTO beans (name, origin, roast_level, process) VALUES
  ('에티오피아 예가체프', '에티오피아', 'light', NULL),
  ('케냐 AA', '케냐', 'light', NULL),
  ('콜롬비아 수프리모', '콜롬비아', 'medium', NULL),
  ('브라질 산토스', '브라질', 'medium', NULL),
  ('과테말라 안티구아', '과테말라', 'medium', NULL);
