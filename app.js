const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const multer = require("multer");

const app = express();
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const cors = require("cors");
app.use(cors({ origin: true }));

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
        addUserDetailsQuery = `INSERT INTO staff(staff_name, employee_number, staff_email, department)
        VALUES ('${name}', '${unique_no}', '${email}', '${department}');`;
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
  const { email, password, userType } = req.body;

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

  const getStudentAttendanceQuery = `SELECT * FROM students_attendance WHERE time_stamp=${time_stamp};`;

  const studentAttendance = await db.get(getStudentAttendanceQuery);

  if (studentAttendance === undefined) {
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

app.get("/attendance", authenticateToken, async (req, res) => {
  const { email } = req.payload;

  const getStudentDetailsQuery = `SELECT * FROM student WHERE student_email='${email}';`;

  const { semester, department, student_id } = await db.get(
    getStudentDetailsQuery
  );

  const getSubjectListQuery = `SELECT * FROM subject WHERE semester=${semester} AND department="${department}" ORDER BY subject_name ASC;`;

  const subjectList = await db.all(getSubjectListQuery);

  // Add Student Hours
  const studentUpdatedList = await Promise.all(
    subjectList.map(async (subject) => {
      const query = `SELECT sum(hours) AS student_hour FROM students_attendance WHERE student_id=${student_id} GROUP BY subject_code HAVING subject_code="${subject.subject_code}";`;

      const data = await db.get(query);

      if (data !== undefined) {
        return {
          ...subject,
          student_hours: data.student_hour,
        };
      } else {
        return {
          ...subject,
          student_hours: 0,
        };
      }
    })
  );

  // ADD Staff Hours
  const staffUpdatedList = await Promise.all(
    studentUpdatedList.map(async (subject) => {
      const query = `SELECT sum(taken_hours) AS staff_hour FROM staffs_attendance WHERE department="${department}" GROUP BY subject_code HAVING subject_code="${subject.subject_code}";`;

      const data = await db.get(query);

      if (data !== undefined) {
        return {
          ...subject,
          staff_hours: data.staff_hour,
        };
      } else {
        return {
          ...subject,
          staff_hours: 0,
        };
      }
    })
  );

  res.send({ attendanceData: staffUpdatedList });
});

app.post(
  "/upload-time-table",
  upload.single("pdf"),
  authenticateToken,
  async (req, res) => {
    try {
      const { email } = req.payload;

      const { department } = await db.get(
        `SELECT * FROM staff WHERE staff_email="${email}"`
      );

      if (!email || !department) {
        return res
          .status(400)
          .json({ error: "Email and department are required." });
      }

      const pdfData = req.file.buffer.toString("base64");
      await db.run(
        `UPDATE time_table SET data="${pdfData}" WHERE department='${department}';`
      );
      res.sendStatus(200);
    } catch (error) {
      console.error("Error uploading PDF:", error);
      res.sendStatus(500);
    }
  }
);

app.get("/time-table", authenticateToken, async (req, res) => {
  const { email, user_type } = req.payload;

  const { department } = await db.get(
    `SELECT * FROM ${user_type} WHERE ${user_type}_email="${email}"`
  );

  try {
    const result = await db.get(
      `SELECT * FROM time_table WHERE department="${department}";`
    );
    res.json(result);
  } catch (error) {
    console.error("Error fetching PDFs:", error);
    res.sendStatus(500);
  }
});

app.post(
  "/upload-calender",
  upload.single("pdf"),
  authenticateToken,
  async (req, res) => {
    try {
      const pdfData = req.file.buffer.toString("base64");
      await db.run(`UPDATE calender SET data="${pdfData}" WHERE id=1;`);
      res.sendStatus(200);
    } catch (error) {
      console.error("Error uploading PDF:", error);
      res.sendStatus(500);
    }
  }
);

app.get("/calender", authenticateToken, async (req, res) => {
  try {
    const result = await db.get(`SELECT * FROM calender WHERE id=1;`);
    res.json(result);
  } catch (error) {
    console.error("Error fetching PDFs:", error);
    res.sendStatus(500);
  }
});

//Testing GET API
app.get("/", async (req, res) => {
  const getAllUsersQuery = `
    SELECT * FROM calender;
  `;

  const userArray = await db.all(getAllUsersQuery);
  res.send(userArray);
});

// app.post(
//   "/upload-pdf",
//   upload.single("pdf"),
//   authenticateToken,
//   async (req, res) => {
//     try {
//       const { id, name, department } = req.body;

//       if (!name || !department || !id) {
//         return res
//           .status(400)
//           .json({ error: "id, Name and department are required." });
//       }

//       const pdfData = req.file.buffer.toString("base64");
//       await db.run(
//         "INSERT INTO pdf_data (id, name, department, data) VALUES (?, ?, ?, ?)",
//         [id, name, department, pdfData]
//       );
//       res.sendStatus(200);
//     } catch (error) {
//       console.error("Error uploading PDF:", error);
//       res.sendStatus(500);
//     }
//   }
// );

// app.get("/pdf-data", async (req, res) => {
//   try {
//     const result = await db.all(
//       "SELECT id, name, department, data FROM pdf_data"
//     );
//     res.json(result);
//   } catch (error) {
//     console.error("Error fetching PDFs:", error);
//     res.sendStatus(500);
//   }
// });

// app.delete("/delete-pdf/:id", async (req, res) => {
//   const { id } = req.params;

//   try {
//     const result = await db.run(`DELETE FROM pdf_data WHERE id="${id}";`);
//     res.json(result);
//   } catch (error) {
//     console.error("Error Deleting PDFs:", error);
//     res.sendStatus(500);
//   }
// });
