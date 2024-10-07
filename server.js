const readdir = require('fs')
const {extname, join} = require('path')
const queue = require('./queue')

//server file 
const express = require('express'); 
const http = require('http'); 
const { Server } = require('socket.io'); // Importing the Server class from socket.io


const app = express(); 
const server = http.createServer(app); 
const port = 3001;

const io = new Server(server, { 
    cors: { 
        origin: ['http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:5175','http://solflowernm.com']
    }
});

(async () => { 

    app.get("/stream", (req, res) => {
        const { id, client } = queue.addClient();

        res.set({
            "Content-Type": "audio/mp3",
            "Transfer-Encoding": "chunked",
        }).status(200);

        client.pipe(res);

        req.on("close", () => {
            queue.removeClient(id);
        });
    });
    app.get("/test", (req, res) => { 
        res.json({
            "isworking": true
        })
    })

    io.on('connection', socket => { 
        console.log("new listener connected!");

        if (queue.bufferHeader) {
            socket.emit("bufferHeader", queue.bufferHeader);
        }

        socket.on("bufferHeader", (header) => {
            queue.bufferHeader = header;
            socket.broadcast.emit("bufferHeader", queue.bufferHeader);
        });

        socket.on("stream", (packet) => {
            if (!queue.bufferHeader) return;
            console.log(packet)
            socket.broadcast.emit("stream", packet);
        });

        socket.on("control", (command) => {
            switch (command) {
                case "pause":
                    queue.pause();
                    break;
                case "resume":
                    queue.resume();
                    break;
            }
        });

        //CHAT 
        socket.on('send-message', (message, user) => { 
            io.emit('receive-message', message, user);
            console.log(message);
        });
    });
    
    // Start the HTTP server
    server.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
})()
