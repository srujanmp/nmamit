const http = require('http');
const fs = require('fs');
const url = require('url');
const Connection = require('tedious').Connection;
const Request = require('tedious').Request;

// Database configuration
const config = {
    server: 'projectlibraryserver.database.windows.net',
    authentication: {
        type: 'default',
        options: {
            userName: 'internship82',
            password: '$Sylylgo2ru'
        }
    },
    options: {
        encrypt: true,
        database: 'library'
    }
};

// Function to handle database connection
function connectToDatabase(callback) {
    const connection = new Connection(config);
    
    connection.on('connect', function(err) {
        if (err) {
            console.error('Error: ', err);
        } else {
            console.log('Connected to database');
            callback(connection);
        }
    });

    connection.connect();
}

// Function to authenticate user
function authenticateUser(email, pin, callback) {
    connectToDatabase(function(connection) {
        const request = new Request(
            `SELECT * FROM Account WHERE Email='${email}' AND Pin=${pin};`,
            function(err, rowCount) {
                if (err) {
                    console.error('Error: ', err);
                    callback(err);
                } else {
                    if (rowCount > 0) {
                        callback(null, true); // User authenticated
                    } else {
                        callback(null, false); // User not found or pin incorrect
                    }
                }
            }
        );

        connection.execSql(request);
    });
}

// Create a simple server to serve the HTML file and handle login requests
http.createServer(function(req, res) {
    const q = url.parse(req.url, true);
    const filename = '.' + q.pathname;
    
    if (filename === './login') {
        // Handle login request
        const email = q.query.email;
        const pin = parseInt(q.query.pin);

        authenticateUser(email, pin, function(err, isAuthenticated) {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            } else {
                if (isAuthenticated) {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Login successful');
                } else {
                    res.writeHead(401, { 'Content-Type': 'text/plain' });
                    res.end('Invalid email or pin');
                }
            }
        });
    } else {
        // Serve the HTML login page
        fs.readFile('login.html', function(err, data) {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                return res.end('404 Not Found');
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.write(data);
            return res.end();
        });
    }
}).listen(8080);

console.log('Server running at http://localhost:8080/');
