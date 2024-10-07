const { PassThrough } = require('stream');
const { v4: uuidv4 } = require('uuid');
const { readdir } = require('fs').promises;
const { extname, join } = require('path');
const Throttle = require('throttle');
const { createReadStream } = require('fs');
const ffprobe = require('ffprobe');  // Ensure you have ffprobe installed and configured properly
const ffprobeStatic = require('ffprobe-static');

class Queue {
    constructor() {
        this.clients = new Map();
        this.tracks = [];
        this.index = 0;
        this.currentTrack = null;
        this.stream = null;
        this.playing = false;
        this.bufferHeader = null;
    }

    addClient() {
        const id = uuidv4();
        const client = new PassThrough();
        this.clients.set(id, client);
        console.log(`Client ${id} connected`);
        return { id, client };
    }

    removeClient(id) {
        this.clients.delete(id);
        console.log(`Client ${id} disconnected`);
    }

    broadcast(chunk) {
        this.clients.forEach((client) => {
            client.write(chunk);
        });
    }

    async loadTracks(dir) {
        try {
            let filenames = await readdir(dir);
            filenames = filenames.filter((filename) => extname(filename) === ".mp3");
            const filepaths = filenames.map((filename) => join(dir, filename));

            const promises = filepaths.map(async (filepath) => {
                const bitrate = await this.getTrackBitrate(filepath);
                return { filepath, bitrate };
            });

            this.tracks = await Promise.all(promises);
            console.log(`Loaded ${this.tracks.length} tracks`);
        } catch (error) {
            console.error("Error loading tracks:", error);
        }
    }

    async getTrackBitrate(filepath) {
        return new Promise((resolve, reject) => {
            ffprobe(filepath, { path: ffprobeStatic.path }, (err, data) => {
                if (err) return reject(err);
                const bitrate = data.format.bit_rate;
                resolve(bitrate ? parseInt(bitrate) : 128000);
            });
        });
    }

    getNextTrack() {
        if (this.index >= this.tracks.length - 1) {
            this.index = 0;
        }
        const track = this.tracks[this.index++];
        this.currentTrack = track;
        return track;
    }

    loadTrackStream() {
        const track = this.currentTrack;
        if (!track) return;
        console.log("Starting audio stream");
        this.stream = createReadStream(track.filepath);
    }

    async start() {
        const track = this.currentTrack;
        if (!track) return;
        this.playing = true;
        this.throttle = new Throttle(track.bitrate / 8);

        this.stream
            .pipe(this.throttle)
            .on("data", (chunk) => this.broadcast(chunk))
            .on("end", () => this.play(true))
            .on("error", () => this.play(true));
    }

    pause() {
        if (!this.started() || !this.playing) return;
        this.playing = false;
        console.log("Paused");
        this.throttle.removeAllListeners("end");
        this.throttle.end();
    }

    started() {
        return this.stream && this.throttle && this.currentTrack;
    }

    resume() {
        if (!this.started() || this.playing) return;
        console.log("Resumed");
        this.start();
    }

    play(useNewTrack = false) {
        if (useNewTrack || !this.currentTrack) {
            console.log("Playing new track");
            this.getNextTrack();
            this.loadTrackStream();
            this.start();
        } else {
            this.resume();
        }
    }
}

const queue = new Queue();
module.exports = queue;
