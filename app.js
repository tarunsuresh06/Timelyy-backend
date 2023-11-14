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
const sendToDb = require("./sendToDb");

const dbPath = path.join(__dirname, "timelyy.db");

let db = null;

const PORT = 3000;

// Initializing Database and Server
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(PORT, () => {
      console.log(`Timelyy Server Started`);
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

// Starting Database And Server
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

// Register a Staff or Student API
app.post("/register", async (req, res) => {
  const { name, unique_no, email, password, department, semester, user_type } =
    req.body;

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

      var addUserDetailsQuery;

      if (user_type === "student") {
        addUserDetailsQuery = `INSERT INTO student(student_name, roll_number, student_email, semester, department)
        VALUES ('${name}', '${unique_no}', '${email}', ${semester}, '${department}');`;
      } else {
        addUserDetailsQuery = `INSERT INTO staff(staff_name, employee_number, staff_email, semester, department)
        VALUES ('${name}', '${unique_no}', '${email}', ${semester}, '${department}');`;
      }

      const dbResponse = await db.run(createUserQuery);
      const userResponse = await db.run(addUserDetailsQuery);
      const userId = userResponse.lastID;
      const dbId = dbResponse.lastID;

      res.send({ dbId, userId });
    }
  } else {
    res.status(400);
    res.send({ error_msg: "User Already Exist" });
  }
});

// User Login API
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

// Get Student Data API
app.get("/profile/student", authenticateToken, async (req, res) => {
  const { payload } = req;
  const { email } = payload;

  const getStudentDataQuery = `
    SELECT * FROM student WHERE student_email='${email}';
  `;

  const studentData = await db.get(getStudentDataQuery);
  res.send({ studentData });
});

// Get Staff Data API
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

// Add Subject data from CSV to Database API
app.get("/csvtojson", async (req, res) => {
  let sub_data = null;
  await sendToDb()
    .then((data) => {
      // res.json(data);
      sub_data = data;
      console.log(data);
    })
    .catch((err) => {
      // res.json({ error: err });
      console.log(err);
    });

  sub_data.forEach(async (element) => {
    var subject_code = element.subject_code,
      subject_name = element.subject_name,
      semester = element.semester,
      department = element.department;

    const addSubjectQuery = `
    INSERT INTO subject(subject_code,subject_name,semester,department) VALUES("${subject_code}", "${subject_name}", "${semester}", "${department}");`;

    const checkSubjectQuery = `SELECT * FROM subject WHERE subject_code = "${subject_code}";`;

    const subject = await db.get(checkSubjectQuery);

    if (subject === undefined) {
      await db.run(addSubjectQuery);
    }
  });

  res.send({ status: "success" });
});

// GET Subject List to Generate QR API
app.post("/subjects", async (req, res) => {
  const { department, semester } = req.body;

  const getSubjectsQuery = `SELECT subject_name, subject_code FROM subject WHERE department = "${department}" AND semester = ${semester};`;

  const subjectData = await db.all(getSubjectsQuery);

  res.send({ subjectData });
});

// Create a New Staff Attendance API
app.post("/staff-attendance", authenticateToken, async (req, res) => {
  const { department, semester, subject_code, hours_taken } = req.body;
  const { email } = req.payload;

  const getStaffDetailsQuery = `SELECT staff_name, staff_id FROM staff WHERE staff_email='${email}';`;

  const getSubjectnameQuery = `SELECT subject_name FROM subject WHERE subject_code = '${subject_code}';`;

  const { staff_name, staff_id } = await db.get(getStaffDetailsQuery);
  const { subject_name } = await db.get(getSubjectnameQuery);

  const time_stamp = Date.now();

  const createStaffAttendanceQuery = `INSERT INTO staffs_attendance(time_stamp, staff_id, staff_name, subject_code, subject_name, semester, department, taken_hours) 
  VALUES(${time_stamp}, ${staff_id}, "${staff_name}", "${subject_code}", "${subject_name}", ${semester}, "${department}", ${hours_taken});`;

  const dbResponse = await db.run(createStaffAttendanceQuery);

  const getStaffAttendanceQuery = `SELECT * FROM staffs_attendance WHERE id ='${dbResponse.lastID}';`;

  const responseData = await db.get(getStaffAttendanceQuery);

  res.send({ staff_attendance: responseData });
});

// Create a New Student Attendance API (QR Format Time_Stamp - Sub_Code - Sub_Name - Staff_Id - Staff_Name - Department - taken_hours)
app.post("/student-attendance", authenticateToken, async (req, res) => {
  const {
    department,
    time_stamp,
    subject_code,
    subject_name,
    taken_hours,
    subject_semester,
  } = req.body;
  const { email } = req.payload;

  const getStudentDetailsQuery = `SELECT student_name, student_id, semester FROM student WHERE student_email='${email}';`;

  const getStudentAttendanceQuery = `SELECT time_stamp AS time FROM students_attendance WHERE time_stamp=${time_stamp};`;

  const { time } = await db.get(getStudentAttendanceQuery);

  console.log(time);

  if (time === undefined) {
    const { student_name, student_id, semester } = await db.get(
      getStudentDetailsQuery
    );

    if (parseInt(subject_semester) === semester) {
      const createStudentAttendanceQuery = `INSERT INTO students_attendance(time_stamp, student_id, student_name, subject_code, subject_name, semester, department, hours) 
    VALUES(${time_stamp}, ${student_id}, "${student_name}", "${subject_code}", "${subject_name}", ${semester}, "${department}", ${taken_hours});`;

      const dbResponse = await db.run(createStudentAttendanceQuery);

      res.send({ lastID: dbResponse.lastID });
    } else {
      res.status(402);
      res.send({ err_msg: "Invalid Attendance" });
    }
  } else {
    res.status(402);
    res.send({ err_msg: "Attendance Already Added" });
  }
});

//Testing GET API
app.get("/", async (req, res) => {
  getAllUsersQuery = `
    SELECT * FROM student;
  `;

  const userArray = await db.all(getAllUsersQuery);
  res.send(userArray);
});
