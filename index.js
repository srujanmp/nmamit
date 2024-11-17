const http = require('http');
const fs = require('fs');
const url = require('url');
const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Function to initialize database
async function initializeDatabase() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS Account (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                pin INTEGER NOT NULL
            );
        `);
        console.log('Database initialized');
    } catch (err) {
        console.error('Error initializing database:', err);
    } finally {
        client.release();
    }
}

// Function to validate PIN
function validatePin(pin) {
    const numPin = Number(pin);
    return !isNaN(numPin) && Number.isInteger(numPin) && numPin >= 0 ? numPin : null;
}

// Function to validate email
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Function to authenticate user
async function authenticateUser(email, pin) {
    if (!validateEmail(email)) {
        return false;
    }
    
    const validPin = validatePin(pin);
    if (validPin === null) {
        return false;
    }

    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM Account WHERE email = $1 AND pin = $2',
            [email, validPin]
        );
        return result.rowCount > 0;
    } catch (err) {
        console.error('Authentication error:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Function to create new user
async function createUser(name, email, pin) {
    if (!validateEmail(email)) {
        throw new Error('Invalid email format');
    }
    
    const validPin = validatePin(pin);
    if (validPin === null) {
        throw new Error('Invalid PIN format');
    }

    const client = await pool.connect();
    try {
        await client.query(
            'INSERT INTO Account (name, email, pin) VALUES ($1, $2, $3)',
            [name, email, validPin]
        );
    } catch (err) {
        if (err.code === '23505') { // Unique violation error code
            throw new Error('Email already exists');
        }
        console.error('Error creating user:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Initialize database on startup
initializeDatabase().catch(console.error);

// Content type mapping
const contentTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif'
};

// Create a server
http.createServer(async function(req, res) {
    console.log(`${req.method} ${req.url}`); // Log incoming requests

    const q = url.parse(req.url, true);
    let filename = '.' + q.pathname;
    
    // Default route
    if (filename === './') {
        filename = './login.html';
    }

    // Handle login
    if (filename === './login') {
        try {
            const email = q.query.email;
            const pin = q.query.pin;

            if (!email || !pin) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Email and PIN are required');
                return;
            }

            const isAuthenticated = await authenticateUser(email, pin);
            
            if (isAuthenticated) {
                res.writeHead(302, { 
                    'Location': '/homepage.html?email=' + encodeURIComponent(email),
                    'Set-Cookie': `email=${encodeURIComponent(email)}; HttpOnly; Path=/`
                });
                res.end();
            } else {
                res.writeHead(401, { 'Content-Type': 'text/plain' });
                res.end('Invalid email or PIN');
            }
        } catch (err) {
            console.error('Login error:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        }
    } 
    // Handle signup
    else if (filename === './signup' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const formData = new URLSearchParams(body);
                const name = formData.get('name');
                const email = formData.get('email');
                const pin = formData.get('pin');
                
                if (!name || !email || !pin) {
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end('Missing required fields');
                    return;
                }

                await createUser(name, email, pin);
                
                // Read and send the login page with success message
                fs.readFile('login.html', function(err, data) {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        return res.end('Internal Server Error');
                    }
                    const successMessage = '<div class="alert-success" style="color: green; text-align: center; margin-top: 10px;">Account created successfully! Please login.</div>';
                    const modifiedData = data.toString().replace('</form>', '</form>' + successMessage);
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(modifiedData);
                });
            } catch (err) {
                console.error('Signup error:', err);
                let errorMessage = 'Internal Server Error';
                let statusCode = 500;

                if (err.message === 'Email already exists') {
                    errorMessage = 'Email already exists';
                    statusCode = 400;
                } else if (err.message === 'Invalid email format' || err.message === 'Invalid PIN format') {
                    errorMessage = err.message;
                    statusCode = 400;
                }

                res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
                res.end(errorMessage);
            }
        });
    }
    // Handle logout
    else if (filename === './logout') {
        res.writeHead(302, {
            'Location': '/login.html',
            'Set-Cookie': 'email=; HttpOnly; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
        });
        res.end();
    }
    // Serve static files
    else {
        fs.readFile(filename, function(err, data) {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                return res.end('404 Not Found');
            }
            
            // Get file extension and corresponding content type
            const ext = filename.substring(filename.lastIndexOf('.'));
            const contentType = contentTypes[ext] || 'text/plain';
            
            res.writeHead(200, { 'Content-Type': contentType });
            
            // If it's the homepage and we have an email query parameter, inject it
            if (filename === './homepage.html' && q.query.email) {
                const modifiedData = data.toString().replace('{{email}}', q.query.email);
                res.end(modifiedData);
            } else {
                res.end(data);
            }
        });
    }
}).listen(process.env.PORT || 8080);

console.log('Server running at http://localhost:8080/');
