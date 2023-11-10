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
const authenticateToken = (req, res, next) => {
  let jwtToken;
  const authHeader = req.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    res.status(401);
    res.send({ error_msg: "Authorization Header is undefined" });
  } else {
    jwt.verify(jwtToken, "ADMIN_123", async (error, payload) => {
      if (error) {
        res.status(401);
        res.send({ error_msg: "Invalid JWT Token" });
      } else {
        req.payload = payload;
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

app.get("/profile/student", authenticateToken, async (req, res) => {
  const { payload } = req;
  const { email } = payload;

  const getStudentDataQuery = `
    SELECT * FROM student
    WHERE student_email='${email}';
  `;

  const studentData = await db.get(getStudentDataQuery);
  res.send({ studentData });
  console.log(studentData);
});

app.get("/profile/staff", authenticateToken, async (req, res) => {
  const { payload } = req;
  const { email } = payload;

  const getStaffDataQuery = `
    SELECT * FROM staff
    WHERE staff_email='${email}';
  `;

  const staffData = await db.get(getStaffDataQuery);
  res.send({ staffData });
});

// Add Student Data API
app.post("/profile/student", async (req, res) => {
  const { studentName, studentRollNo, studentEmail, studentDepartment } =
    req.body;

  const getStudentDataQuery = `SELECT * FROM student WHERE student_email = "${studentEmail}";`;

  const studentDetails = await db.get(getStudentDataQuery);

  if (studentDetails === undefined) {
    const createStudentQuery = `INSERT INTO student(student_name, roll_number, student_email, department)
      VALUES("${studentName}", "${studentRollNo}", "${studentEmail}", "${studentDepartment}");`;

    const studentData = await db.run(createStudentQuery);
    res.send({ studentData });
  } else {
    res.send({ error_msg: "student already added" });
  }
});

// Add Staff Data API
app.post("/profile/staff", async (req, res) => {
  const { teacherName, teacherEmployeeNo, teacherEmail, teacherDepartment } =
    req.body;

  const getTeacherDataQuery = `SELECT * FROM staff WHERE staff_email = "${teacherEmail}";`;

  const teacherDetails = await db.get(getTeacherDataQuery);

  if (teacherDetails === undefined) {
    const createTeacherQuery = `INSERT INTO staff(staff_name, employee_number, staff_email, department)
      VALUES("${teacherName}", "${teacherEmployeeNo}", "${teacherEmail}", "${teacherDepartment}");`;

    const teacherData = await db.run(createTeacherQuery);
    res.send({ teacherData });
  } else {
    res.send({ error_msg: "teacher already added" });
  }
});

app.get("/profile/staff", authenticateToken, async (req, res) => {
  const { payload } = req;
  const { email } = payload;

  getStaffDataQuery = `
    SELECT * FROM staff
    WHERE staff_email='${email}';
  `;

  const staffData = await db.get(getStaffDataQuery);
  res.send({ staffData });
});

app.get("/", async (req, res) => {
  getAllUsersQuery = `
    SELECT * FROM user;
  `;

  const userArray = await db.all(getAllUsersQuery);
  res.send(userArray);
});
