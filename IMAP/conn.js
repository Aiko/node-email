const tls = require('tls')
const hypertext = require('html-to-text')
const atob = require('atob')
const MailParser = require("mailparser-mit").MailParser;

class IMAP {
    constructor(options) {
        this.opts = options || {}
        this.line = 1
        this.sock = null
        this.queue = {}
        this.buffer = ''
    }
    async open(h, p, u, s) {
        return await new Promise((s, j) => {
            let timeout = true
            if (this.sock) this.sock.destroy()
            this.sock = tls.connect({
                host: h || this.opts.host || '127.0.0.1',
                port: p || this.opts.port || 143,
                user: u || this.opts.user || null,
                pass: s || this.opts.pass || null
            }, () => {
                timeout = false
                s(true)
            })
            this.sock.setEncoding('utf8')
            var _this = this
            this.sock.on('data', (d) => {
                if (/((\n[0-9]{8})|(^[0-9]{8}))(?= (OK|NO))/g.exec(d)) {
                    let output = _this.buffer
                    _this.buffer = ''
                    _this.queue[/((\n[0-9]{8})|(^[0-9]{8}))(?= (OK|NO))/g.exec(d)[0].trim()]((output + d).trim())
                } else _this.buffer += d
            })
            setTimeout(() => {
                if (timeout) {
                    j('timeout')
                    this.sock.destroy()
                }
            }, this.opts.timeout || 150000)
        })
    }
    padLine(n) {
        return `${n}`.padStart(8, '0')
    }
    async execute(command) {
        let n = this.line
        this.line += 1
        return await new Promise((s, j) => {
            while (this.queue[this.padLine(n)]) n += 1
            this.queue[this.padLine(n)] = s
            this.sock.write(`${this.padLine(n)} ${command}\r\n`)
        })
    }
    async exec(cmd, f) {
        // pass f if you want to give a preprocessor
        return await new Promise((s, j) => {
            this.execute(cmd).then((d) => {
                try {
                    if (d.indexOf('OK') < 0) j(d)
                    else s(f ? f(d) : d)
                } catch (e) {
                    console.log(e)
                    j(e)
                }
            })
        }).catch((e) => console.log(e))
    }
    async countMessages(box) {
        return await this.exec(`STATUS ${box} (MESSAGES)`, (d) => eval(d.match(/[0-9]*/g).filter(_ => _)[0]))
    }
    async login(username, password) {
        return await this.exec(`LOGIN ${username || this.opts.user} ${password || this.opts.pass}`)
    }
    async getFolders() {
        return await this.exec(`LIST "" "%"`, (d) => d.match(/(([a-zA-Z]+)|(\"[a-zA-Z ]+\"))(?=\r*\n)/g))
    }
    async select(boxName) {
        return await this.exec(`SELECT ${boxName}`)
    }
    async getEmails(start, stop) {
        return await this.exec(`FETCH ${start || 1}${stop ? ':' + stop : ''} (FLAGS BODY.PEEK[])`, (d) => Promise.all(
            d.split(/\* [0-9]* FETCH .*(\r\n|\n)/g)
            .filter(_ => _.length > 5)
            .map(async email => {
                let parser = new MailParser()
                let s = new Promise((s, j) => parser.on('end', (mail) => s(mail)))
                parser.write(email)
                parser.end()
                return await s
            })
        ))
    }
}

module.exports = IMAP