const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();

app.use(express.json());

const cors = require("cors");
app.use(cors({ origin: true }));

const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "timelyy.db");

let db = null;

const PORT = 3000;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(PORT, () => {
      console.log(`Server Running at http://localhost:${PORT}/`);
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

// JwtToken Verification
const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send({ error_msg: "Authorization Header is undefined" });
  } else {
    jwt.verify(jwtToken, "ADMIN_123", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send({ error_msg: "Invalid JWT Token" });
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

app.post("/register", async (req, res) => {
  const { email, password, user_type } = req.body;

  const checkUsernameQuery = `
  SELECT email FROM
   user WHERE email = '${email}';
  `;

  const checkUser = await db.get(checkUsernameQuery);

  if (checkUser === undefined) {
    if (password.length < 6) {
      res.status(400);
      res.send({ error_msg: "Password is too short" });
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
          INSERT INTO user(email, password, user_type)
          VALUES ('${email}', '${hashedPassword}', '${user_type}');
          `;

      const dbResponse = await db.run(createUserQuery);
      const userId = dbResponse.lastID;
      res.send({ userId: userId });
    }
  } else {
    res.status(400);
    res.send({ error_msg: "User Already Exist" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const getUserQuery = `SELECT * FROM user WHERE email = '${email}';`;

  const userDetails = await db.get(getUserQuery);

  if (userDetails === undefined) {
    res.status(400);
    res.send({ error_msg: "Invalid Username" });
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (isPasswordMatched === true) {
      const jwtToken = jwt.sign(userDetails, "ADMIN_123");
      res.send({ jwtToken });
    } else {
      res.status(400);
      res.send({ error_msg: "Invalid Password" });
    }
  }
});

app.get("/profile/:email", async (req, res) => {
  const { email } = req.params;

  getAllUsersQuery = `
    SELECT * FROM user
    WHERE email = '${email}';
  `;

  const user = await db.get(getAllUsersQuery);
  res.send({ user });
});

app.get("/", async (req, res) => {
  getAllUsersQuery = `
    SELECT * FROM user;
  `;

  const userArray = await db.all(getAllUsersQuery);
  res.send(userArray);
});
