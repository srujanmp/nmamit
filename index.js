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

// Function to authenticate user
async function authenticateUser(email, pin) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM Account WHERE email = $1 AND pin = $2',
            [email, pin]
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
    const client = await pool.connect();
    try {
        await client.query(
            'INSERT INTO Account (name, email, pin) VALUES ($1, $2, $3)',
            [name, email, pin]
        );
    } catch (err) {
        console.error('Error creating user:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Initialize database on startup
initializeDatabase().catch(console.error);

// Create a server
http.createServer(async function(req, res) {
    const q = url.parse(req.url, true);
    var filename = '.' + q.pathname;
    
    if (filename === './') {
        filename = './login.html';
    }

    if (filename === './login') {
        try {
            const email = q.query.email;
            const pin = parseInt(q.query.pin);
            const isAuthenticated = await authenticateUser(email, pin);
            
            if (isAuthenticated) {
                res.writeHead(302, { 'Location': '/homepage.html?email=' + encodeURIComponent(email) });
                res.end();
            } else {
                res.writeHead(401, { 'Content-Type': 'text/plain' });
                res.end('Invalid email or pin');
            }
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        }
    } else if (filename === './signup' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            const formData = new URLSearchParams(body);
            const name = formData.get('name');
            const email = formData.get('email');
            const pin = parseInt(formData.get('pin'));
            
            if (!name || !email || !pin) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Missing required fields');
                return;
            }

            try {
                await createUser(name, email, pin);
                fs.readFile('login.html', function(err, data) {
                    if (err) {
                        res.writeHead(404, { 'Content-Type': 'text/html' });
                        return res.end('404 Not Found');
                    }
                    const modifiedData = data.toString().replace('</body>', '<h3>Account created successfully!</h3></body>');
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.write(modifiedData);
                    res.end();
                });
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            }
        });
    } else {
        // Serve static files
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
}).listen(process.env.PORT || 8080);

console.log('Server running at http://localhost:8080/');
