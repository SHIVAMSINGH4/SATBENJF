const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const port = 4500;
const bodyParser = require('body-parser');
const fs = require('fs');
ipAddress = '172.20.10.8'
app.use(bodyParser.json());

app.use(cors());
let data;
let userData;
try {
    const rawdata = fs.readFileSync('sewadar.json');
    data = JSON.parse(rawdata);

    const userdata = fs.readFileSync('user.json');
    userData = JSON.parse(userdata);
} catch (error) {

    
}

const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (authHeader) {
        const token = authHeader.split(' ')[1]; // Bearer <token>

        jwt.verify(token, 'your-secret-key', (err, user) => {
            if (err) {
                return res.sendStatus(403); // Forbidden
            }

            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401); // Unauthorized
    }
};

app.get('/', (req, res) => {
    res.status(200);
    res.send(`User API is running on ${ipAddress}:${port}`);
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = userData.users.find(u => u.username === username && u.password === password);

    if (user) {
        const token = jwt.sign(
            { userId: user.id, username: user.username, role: user.role },
            'your-secret-key',
            { expiresIn: '6h' }
        );

        res.json({
            message: 'Authentication successful!',
            token: token,
            name: user.name,
            role: user.role
        });
    } else {
        // User not authenticated
        res.status(401).json({ message: 'Authentication failed. User not found.' });
    }
});

app.get('/sewadarAllData', authenticateJWT,(req, res) => {
    res.json(data);
});


// Define a route to search data by badge number or name
app.get('/sewadar/search', authenticateJWT,(req, res) => {
    const query = req.query.q;

    if (!query) {
        return res.status(400).json({ error: 'Please provide a search query in the URL' });
    }

    // Search by badge number or name
    const results = data.sewadarData.filter(sewadar => {
        const lowerCaseQuery = query.toLowerCase();
        const badgeNoLowerCase = sewadar['BADGE NO'].toLowerCase();
        const nameLowerCase = sewadar.NAME.toLowerCase();

        return badgeNoLowerCase.includes(lowerCaseQuery) || nameLowerCase.includes(lowerCaseQuery);
    });

    return results.length > 0
        ? res.json(results)
        : res.status(404).json({ error: 'No sewadar found with the provided badge number or name' });
});


app.post('/sewadar/add', authenticateJWT,(req, res) => {
    const newSewadar = req.body;
    if (!newSewadar || !newSewadar['BADGE NO']) {
        return res.status(400).json({ error: 'Please provide valid sewadar data in the request body' });
    }
    const existingSewadar = data.sewadarData.find(sewadar => sewadar['BADGE NO'] === newSewadar['BADGE NO']);
    if (existingSewadar) {
        return res.status(400).json({ error: 'Sewadar with the provided badge number already exists' });
    }
    data.sewadarData.push(newSewadar);
    fs.writeFileSync('sewadarData.json', JSON.stringify(data, null, 2));
    res.json({ message: 'Sewadar added successfully', sewadar: newSewadar });
});


// Add attendance endpoint
app.post('/sewadar/attendance',authenticateJWT, (req, res) => {
    const { month, day, date, badgeNo, isPresent } = req.body;
    console.log(month, day, date, badgeNo, isPresent);

    // Find the sewadar by badge number
    const sewadar = data.sewadarData.find(sewadar => sewadar['BADGE NO'] === badgeNo);

    if (sewadar) {
        // Ensure the Attendance object and its nested structure exist
        sewadar.Attendance = sewadar.Attendance || {};
        sewadar.Attendance[month] = sewadar.Attendance[month] || {};
        sewadar.Attendance[month][day] = sewadar.Attendance[month][day] || [];

        const attendanceIndex = sewadar.Attendance[month][day].indexOf(date);

        if (isPresent && attendanceIndex === -1) {
            // Add the date if it's not already in the array
            sewadar.Attendance[month][day].push(date);
            fs.writeFileSync('sewadar.json', JSON.stringify(data, null, 2));
            res.json({ success: true, message: 'Attendance marked as present' });
        } else if (!isPresent) {
            // Handle the case where isPresent is false but not removing the date
            res.json({ success: true, message: 'Attendance already marked as absent' });
        } else {
            // Date is already present in the array
            res.json({ success: false, message: 'Attendance already marked as present' });
        }
    } else {
        res.status(404).json({ success: false, message: 'Sewadar not found' });
    }
});


app.get('/sewadar-summary',authenticateJWT, (req, res) => {

    const summary = generateSewadarSummary(data.sewadarData);
    res.status(200).json(summary);
});

app.get('/currentDayAttendance',authenticateJWT, (req, res) => {
    const { date, day } = req.query;
    if (!date || !day) {
        return res.status(400).send('Date and day are required');
    }
    const presentPeople = filterAttendanceByDate(data.sewadarData, date, day);

    const males = presentPeople.filter(p => p.GENDER === 'Male').map(p => ({
        name: p.NAME,
        badgeNumber: p['BADGE NO'],
        gender: p.GENDER
    }));
    const females = presentPeople.filter(p => p.GENDER === 'Female').map(p => ({
        name: p.NAME,
        badgeNumber: p['BADGE NO'],
        gender: p.GENDER
    }));

    res.json({
        males: {
            count: males.length,
            attendees: males
        },
        females: {
            count: females.length,
            attendees: females
        }
    });
});


function filterAttendanceByDate(data, date, day) {
    return data.filter(person => {
        if (!person.Attendance) {
            // If there's no Attendance object, skip this person
            return false;
        }

        const attendance = person.Attendance;
        const month = new Date(date).toLocaleString('en-US', { month: 'long' });

        if (!attendance[month]) {
            // If there's no entry for the specific month, skip this person
            return false;
        }

        // Check if the person was present on the given day and date
        return attendance[month][day] && attendance[month][day].includes(date);
    });
}



function generateSewadarSummary(data) {
    const summary = [];
    if (Array.isArray(data)) {
        data.forEach(sewadar => {
            const attendanceSummary = {
                badgeNumber: sewadar['BADGE NO'],
                name: sewadar['NAME'],
                attendance: countDayOfWeek(sewadar.Attendance)
            };

            summary.push(attendanceSummary);
        });
    }
    return summary;
}

function countDayOfWeek(attendance) {
    const daysOfWeek = ['Sunday', 'Thursday'];
    const summary = {};

    for (const month in attendance) {
        for (const dayOfWeek in attendance[month]) {
            const count = attendance[month][dayOfWeek].length;
            if (!summary[month]) {
                summary[month] = {};
            }
            summary[month][dayOfWeek] = count;
        }

    }

    return summary;
}
app.use((req, res) => {
    res.status(404).send('404 Not Found');
});

app.listen(port, () => {
    console.log(`Server is running on localhost:${port}`);
});