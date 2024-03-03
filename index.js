const http = require("http");
const fs = require("fs");
const url = require("url");
const Connection = require("tedious").Connection;
const Request = require("tedious").Request;
const multer = require("multer");

// Database configuration
const config = {
    server: process.env.DB_SERVER,
    authentication: {
        type: "default",
        options: {
            userName: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
        },
    },
    options: {
        encrypt: true,
        database: process.env.DB_NAME,
    },
};





// Function to handle database connection
function connectToDatabase(callback) {
	const connection = new Connection(config);

	connection.on("connect", function (err) {
		if (err) {
			console.error("Error: ", err);
		} else {
			console.log("Connected to database");
			callback(connection);
		}
	});

	connection.connect();
}

// Function to authenticate user
function authenticateUser(email, pin, callback) {
	connectToDatabase(function (connection) {
		const request = new Request(
			`SELECT * FROM Account WHERE email='${email}' AND password='${pin}';`,
			function (err, rowCount) {
				if (err) {
					console.error("Error: ", err);
					callback(err);
				} else {
					if (rowCount > 0) {
						callback(null, true); // User authenticated
					} else {
						callback(null, false); // User not found or pin incorrect
					}
				}
			},
		);

		connection.execSql(request);
	});
}

// Function to insert a new user into the Account table
function createUser(name, email, pin, callback) {
	connectToDatabase(function (connection) {
		const request = new Request(
			`INSERT INTO Account (name, email,password) VALUES ('${name}', '${email}', '${pin}');`,
			function (err) {
				if (err) {
					console.error("Error: ", err);
					callback(err);
				} else {
					callback(null);
				}
			},
		);

		connection.execSql(request);
	});
}

// Multer configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/"); // Directory where uploaded files will be stored
    },
    filename: function (req, file, cb) {
	    file=file.replace(/\\s+/g, '');//edited
        cb(null, Date.now() + "-" + file.originalname); // Unique filename
    },
});

const upload = multer({ storage: storage });



// Function to insert a new Item into the Item table
function createItem(url, name, desc, contact, callback) {
    connectToDatabase(function (connection) {
        const request = new Request(
		url=url.replace(/\\s+/g, '');//edited
            `INSERT INTO Item (ImageUrl ,ItemName, ItemDescription, ItemContact) VALUES ('${url}','${name}', '${desc}', ${contact});`,
            function (err) {
                if (err) {
                    console.error("Error: ", err);
                    callback(err);
                } else {
                    callback(null);
                }
            },
        );

        connection.execSql(request);
    });
}

// Function to fetch all items from the Item table
function fetchItems(callback) {
	connectToDatabase(function (connection) {
		const request = new Request("SELECT * FROM Item ORDER BY ItemID DESC", function (
			err,
			rowCount,
			rows,
		) {
			if (err) {
				console.error("Error: ", err);
				callback(err);
			} else {
				console.log(rowCount + " row(s) returned");
			}
		});

		const data = [];
		request.on("row", function (columns) {
			const rowData = {};
			columns.forEach(function (column) {
				rowData[column.metadata.colName] = column.value;
			});
			data.push(rowData);
		});

		request.on("doneProc", function (rowCount, more) {
			console.log(rowCount + " row(s) returned");
			callback(null, data);
		});

		connection.execSql(request);
	});
}

// Create a server
http
	.createServer(function (req, res) {
		const q = url.parse(req.url, true);
		var filename = "." + q.pathname;
		if (filename === "./") {
			filename = "./login.html";
		}
		if (filename === "./login") {
			// Handle login request
			const email = q.query.email;
			const pin = q.query.pin;
			if (filename === "./signup") {
				// Redirect to signup page
				res.writeHead(302, { Location: "/signup.html" });
				res.end();
			}
			authenticateUser(email, pin, function (err, isAuthenticated) {
				if (err) {
					res.writeHead(500, { "Content-Type": "text/plain" });
					res.end("Internal Server Error");
				} else {
					if (isAuthenticated) {
						// Redirect to homepage upon successful login
						res.writeHead(302, {
							Location: "/homepage.html?email=" + encodeURIComponent(email),
						});
						res.end();
					} else {
						res.writeHead(401, { "Content-Type": "text/plain" });
						res.end("Invalid email or password");
					}
				}
			});
		} else if (filename === "./homepage.html") {
			// Ensure authentication before serving homepage
			const email = q.query.email || "";
			if (!email) {
				res.writeHead(401, { "Content-Type": "text/plain" });
				res.end("Unauthorized");
				return;
			}
			fs.readFile("homepage.html", function (err, data) {
				if (err) {
					res.writeHead(404, { "Content-Type": "text/html" });
					return res.end("404 Not Found");
				}
				// Replace placeholder with email
				const modifiedData = data.toString().replace("{{email}}", email);
				res.writeHead(200, { "Content-Type": "text/html" });
				res.write(modifiedData);
				return res.end();
			});
		} else if (filename === "./logout") {
			// Redirect to login page upon logout
			res.writeHead(302, { Location: "/login.html" });
			res.end();
		} else if (filename === "./signup" && req.method === "POST") {
			// Handle signup form submission
			let body = "";
			req.on("data", function (chunk) {
				body += chunk.toString();
			});
			req.on("end", function () {
				const formData = new URLSearchParams(body);
				const name = formData.get("name");
				const email = formData.get("email");
				const pin = formData.get("pin");

				// Validate data
				if (!name || !email || !pin) {
					res.writeHead(400, { "Content-Type": "text/plain" });
					res.end("Missing required fields");
				} else {
					// Insert new user into database
					createUser(name, email, pin, function (err) {
						if (err) {
							res.writeHead(500, { "Content-Type": "text/plain" });
							res.end(err+"Internal Server Error");
						} else {
							// Account created successfully message
							const successMessage = "<h3>Account created successfully!</h3>";

							// Serve the signup form with success message
							fs.readFile("login.html", function (err, data) {
								if (err) {
									res.writeHead(404, { "Content-Type": "text/html" });
									return res.end("404 Not Found");
								}
								const modifiedData = data
									.toString()
									.replace("</body>", successMessage + "</body>");
								res.writeHead(200, { "Content-Type": "text/html" });
								res.write(modifiedData);
								return res.end();
							});
						}
					});
				}
			});
		} else if (filename === "./itemupload" && req.method === "POST") {
            // Handle item upload form submission with Multer
            upload.single("image")(req, res, function (err) {
                if (err instanceof multer.MulterError) {
                    // Multer error handling
                    res.writeHead(500, { "Content-Type": "text/plain" });
                    res.end("Multer Error");
                } else if (err) {
                    // Other errors
                    res.writeHead(500, { "Content-Type": "text/plain" });
                    res.end("Internal Server Error");
                } else {
                    const url = req.file.path; // Path to the uploaded file
                    const name = req.body.name;
                    const desc = req.body.desc;
                    const contact = parseInt(req.body.contact);

                    // Validate data
                    if (!url || !name || !desc || !contact) {
                        res.writeHead(400, { "Content-Type": "text/plain" });
                        res.end("Missing required fields");
                    } else {
                        // Insert new item into database
                        createItem(url, name, desc, contact, function (err) {
                            if (err) {
                                res.writeHead(500, { "Content-Type": "text/plain" });
                                res.end("Internal Server Error");
                            } else {
                                // Item created successfully message
                                const successMessage = "<h3>Item created successfully!</h3>";

                                // Serve the upload form with success message
                                fs.readFile("upload.html", function (err, data) {
                                    if (err) {
                                        res.writeHead(404, { "Content-Type": "text/html" });
                                        return res.end("404 Not Found");
                                    }
                                    const modifiedData = data
                                        .toString()
                                        .replace("</body>", successMessage + "</body>");
                                    res.writeHead(200, { "Content-Type": "text/html" });
                                    res.write(modifiedData);
                                    return res.end();
                                });
                            }
                        });
                    }
                }
            });
        } else if (filename === "./items") {
			// Fetch items and display as a table
			fetchItems(function (err, data) {
				if (err) {
					res.writeHead(500, { "Content-Type": "text/plain" });
					res.end("Internal Server Error");
				} else {
					let tableHtml =
						'<head><style>@media only screen and (max-width: 768px){html {font-size: 25px;}}</style></head><body><table border="1"><tr>';
					const keys = Object.keys(data[0]); // Get the keys from the first row to ensure consistency
					keys.forEach(function (key) {
						tableHtml += '<th style="width: 20%;">' + key + "</th>";
					});
					tableHtml += "</tr>";
					data.forEach(function (row) {
						tableHtml += "<tr>";
						keys.forEach(function (key) {
							if (key === "ImageUrl") {
								// Assuming the column name for image URL is 'ImageURL'
								tableHtml +=
									'<td><img src="' + row[key] + '" style="width:100%;" /></td>';
							} else {
								tableHtml +=
									'<td  style="text-align: center">' + row[key] + "</td>";
							}
						});
						tableHtml += "</tr>";
					});
					tableHtml += "</table></body>";
					res.writeHead(200, { "Content-Type": "text/html" });
					res.end(tableHtml);
				}
			});
		} else {
			// Serve other static files (e.g., CSS, JS)
			fs.readFile(filename, function (err, data) {
				if (err) {
					res.writeHead(404, { "Content-Type": "text/html" });
					return res.end("404 Not Found");
				}
				res.writeHead(200);
				res.write(data);
				return res.end();
			});
		}
	})
	.listen(8080);

console.log("Server running at http://localhost:8080/");
