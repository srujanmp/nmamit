const http = require('http');
const fs = require('fs');
const url = require('url');
const Connection = require('tedious').Connection;
const Request = require('tedious').Request;

// Database configuration
const config = {
   server: "projectlibraryserver.database.windows.net",
   authentication: {
       type: 'default',
       options: {
           userName: "internship82",
           password: "$Sylylgo2ru"
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
           `SELECT * FROM Account WHERE email='${email}' AND pin=${pin};`,
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

// Function to insert a new user into the Account table
function createUser(name, email, pin, callback) {
   connectToDatabase(function(connection) {
       const request = new Request(
           `INSERT INTO Account (name, email, pin) VALUES ('${name}', '${email}', ${pin});`,
           function(err) {
               if (err) {
                   console.error('Error: ', err);
                   callback(err);
               } else {
                   callback(null);
               }
           }
       );

       connection.execSql(request);
   });
}

// Function to insert a new Item into the Item table
function createItem(url,name, desc, contact, callback) {
   connectToDatabase(function(connection) {
       const request = new Request(
           `INSERT INTO Item (ImageUrl ,ItemName, ItemDescription, ItemContact) VALUES ('${url}','${name}', '${desc}', ${contact});`,
           function(err) {
               if (err) {
                   console.error('Error: ', err);
                   callback(err);
               } else {
                   callback(null);
               }
           }
       );

       connection.execSql(request);
   });
}

// Function to fetch all items from the Item table
function fetchItems(callback) {
   connectToDatabase(function(connection) {
       const request = new Request('SELECT * FROM Item', function(err, rowCount, rows) {
           if (err) {
               console.error('Error: ', err);
               callback(err);
           } else {
               console.log(rowCount + ' row(s) returned');
           }
       });

       const data = [];
       request.on('row', function(columns) {
           const rowData = {};
           columns.forEach(function(column) {
               rowData[column.metadata.colName] = column.value;
           });
           data.push(rowData);
       });

       request.on('doneProc', function(rowCount, more) {
           console.log(rowCount + ' row(s) returned');
           callback(null, data);
       });

       connection.execSql(request);
   });
}

// Create a server
http.createServer(function(req, res) {
   const q = url.parse(req.url, true);
   var filename = '.' + q.pathname;
   if (filename === './') {
       filename = './login.html';
   }
   if (filename === './login') {
       // Handle login request
       const email = q.query.email;
       const pin = parseInt(q.query.pin);
       if (filename === './signup') {
           // Redirect to signup page
           res.writeHead(302, { 'Location': '/signup.html' });
           res.end();
       }
       authenticateUser(email, pin, function(err, isAuthenticated) {
           if (err) {
               res.writeHead(500, { 'Content-Type': 'text/plain' });
               res.end('Internal Server Error');
           } else {
               if (isAuthenticated) {
                   // Redirect to homepage upon successful login
                   res.writeHead(302, { 'Location': '/homepage.html?email=' + encodeURIComponent(email) });
                   res.end();
               } else {
                   res.writeHead(401, { 'Content-Type': 'text/plain' });
                   res.end('Invalid email or pin');
               }
           }
       });
   } else if (filename === './homepage.html') {
       // Ensure authentication before serving homepage
       const email = q.query.email || '';
       if (!email) {
           res.writeHead(401, { 'Content-Type': 'text/plain' });
           res.end('Unauthorized');
           return;
       }
       fs.readFile('homepage.html', function(err, data) {
           if (err) {
               res.writeHead(404, { 'Content-Type': 'text/html' });
               return res.end('404 Not Found');
           }
           // Replace placeholder with email
           const modifiedData = data.toString().replace('{{email}}', email);
           res.writeHead(200, { 'Content-Type': 'text/html' });
           res.write(modifiedData);
           return res.end();
       });
   } else if (filename === './logout') {
       // Redirect to login page upon logout
       res.writeHead(302, { 'Location': '/login.html' });
       res.end();
   } else if (filename === './signup' && req.method === 'POST') {
       // Handle signup form submission
       let body = '';
       req.on('data', function(chunk) {
           body += chunk.toString();
       });
       req.on('end', function() {
           const formData = new URLSearchParams(body);
           const name = formData.get('name');
           const email = formData.get('email');
           const pin = parseInt(formData.get('pin'));
           
           // Validate data
           if (!name || !email || !pin) {
               res.writeHead(400, { 'Content-Type': 'text/plain' });
               res.end('Missing required fields');
           } else {
               // Insert new user into database
               createUser(name, email, pin, function(err) {
                   if (err) {
                       res.writeHead(500, { 'Content-Type': 'text/plain' });
                       res.end('Internal Server Error');
                   } else {
                       // Account created successfully message
                       const successMessage = '<h3>Account created successfully!</h3>';
                       
                       // Serve the signup form with success message
                       fs.readFile('login.html', function(err, data) {
                           if (err) {
                               res.writeHead(404, { 'Content-Type': 'text/html' });
                               return res.end('404 Not Found');
                           }
                           const modifiedData = data.toString().replace('</body>', successMessage + '</body>');
                           res.writeHead(200, { 'Content-Type': 'text/html' });
                           res.write(modifiedData);
                           return res.end();
                       });
                   }
               });
           }
       });
   } else if (filename === './itemupload' && req.method === 'POST') {
       // Handle item upload form submission
       let body = '';
       req.on('data', function(chunk) {
           body += chunk.toString();
       });
       req.on('end', function() {
           const formData = new URLSearchParams(body);
           const url = formData.get('url');
           const name = formData.get('name');
           const desc = formData.get('desc');
           const contact = parseInt(formData.get('contact'));
           
           // Validate data
           if (!url || !name || !desc || !contact) {
               res.writeHead(400, { 'Content-Type': 'text/plain' });
               res.end('Missing required fields');
           } else {
               // Insert new item into database
               createItem(name, desc, contact, function(err) {
                   if (err) {
                       res.writeHead(500, { 'Content-Type': 'text/plain' });
                       res.end('Internal Server Error');
                   } else {
                       // Item created successfully message
                       const successMessage = '<h3>Item created successfully!</h3>';
                       
                       // Serve the upload form with success message
                       fs.readFile('upload.html', function(err, data) {
                           if (err) {
                               res.writeHead(404, { 'Content-Type': 'text/html' });
                               return res.end('404 Not Found');
                           }
                           const modifiedData = data.toString().replace('</body>', successMessage + '</body>');
                           res.writeHead(200, { 'Content-Type': 'text/html' });
                           res.write(modifiedData);
                           return res.end();
                       });
                   }
               });
           }
       });
   } else if (filename === './items') {
    // Fetch items and display as a table
    fetchItems(function(err, data) {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        } else {
            let tableHtml = '<table border="1"><tr>';
            const keys = Object.keys(data[0]); // Get the keys from the first row to ensure consistency
            keys.forEach(function(key) {
                tableHtml += '<th>' + key + '</th>';
            });
            tableHtml += '</tr>';
            data.forEach(function(row) {
                tableHtml += '<tr>';
                keys.forEach(function(key) {
                    if (key === 'ImageUrl') { // Assuming the column name for image URL is 'ImageURL'
                        tableHtml += '<td><img src="' + row[key] + '" style="width: 30%;" /></td>';
                    } else {
                        tableHtml += '<td>' + row[key] + '</td>';
                    }
                });
                tableHtml += '</tr>';
            });
            tableHtml += '</table>';
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(tableHtml);
        }
    });
}
else {
       // Serve other static files (e.g., CSS, JS)
       fs.readFile(filename, function(err, data) {
           if (err) {
               res.writeHead(404, { 'Content-Type': 'text/html' });
               return res.end('404 Not Found');
           }
           res.writeHead(200);
           res.write(data);
           return res.end();
       });
   }
}).listen(8080);

console.log('Server running at http://localhost:8080/');
