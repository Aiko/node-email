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
    async close() { this.sock.destroy() }
    async open(h, p, u, s, x) {
        return await new Promise((s, j) => {
            let timeout = true
            if (this.sock) this.sock.destroy()
            this.sock = tls.connect({
                host: h || this.opts.host || null,
                port: p || this.opts.port || 993,
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
        console.log(command)
        let n = this.line
        this.line += 1
        return await new Promise((s, j) => {
            while (this.queue[this.padLine(n)]) n += 1
            this.queue[this.padLine(n)] = s
            this.sock.write(`${this.padLine(n)} ${command}\r\n`)
        })
    }
    async exec(cmd, f) {
        let d = await this.execute(cmd).catch(e => console.log(e))
        if (!d.match(/^[0-9]+ OK/gim)) throw d
        return d.match(/^[0-9]+ OK/gim) ? (f ? f(d) : d) : null
        /*
        // pass f if you want to give a preprocessor
        return await new Promise((s, j) => {
            this.execute(cmd).then((d) => { //d.match(/^0-9]+ OK/gim) ? s(f ? f(d) : d) : null)
                try {
                    if (!d.match(/^[0-9]+ OK/gim)) throw d //j(d)
                    else s(f ? f(d) : d)
                } catch (e) {
                    console.log(e)
                    throw e
                    //j(e)
                }
            })
        })*/
    }
    async countMessages(box) {
        return await this.exec(`STATUS ${box} (MESSAGES)`, (d) => eval(d.match(/[0-9]*/g).filter(_ => _)[0]))
    }
    async login(username, password, xoauth) {
        if (password || this.opts.pass)
            return await this.exec(`LOGIN ${username || this.opts.user} ${password || this.opts.pass}`)
        else {
            console.log("TRYING XOAUTH");
            let s = await this.exec(`AUTHENTICATE XOAUTH2 ${xoauth || this.opts.xoauth}`)
            this.exec(``)
            return s
        }
    }
    async deleteMessages(uid) {
        return await this.exec(`STORE ${uid} +FLAGS \\Deleted`)
    }
    async restoreMessages(uid) {
        return await this.exec(`STORE ${uid} -FLAGS \\Deleted`)
    }
    async read(uid) {
        return await this.exec(`STORE ${uid} +FLAGS \\Seen`)
    }
    async unread(uid) {
        return await this.exec(`STORE ${uid} -FLAGS \\Seen`)
    }
    async getFolders() {
        return await this.exec(`LIST "" "*"`, (d) => d.match(/(([a-zA-Z\[\]\\\/ /]+)|(\"[a-zA-Z \[\]\\\/]+\"))(?=\r*\n)/g))
    }
    async select(boxName) { console.log("SELECT "+boxName)
        return await this.exec(`SELECT ${boxName}`)
    }
    async getEmails(start, stop) {
        return await this.exec(`FETCH ${start || 1}${stop ? ':' + stop : ''} (FLAGS BODY.PEEK[])`, (d) => Promise.all(
            d.split(/(?=\* [0-9]* FETCH .*(\r\n|\n))/g)
            .filter(_ => _.length > 5)
            .map(async email => {
                let parser = new MailParser()
                let s = new Promise((s, j) => parser.on('end', (mail) => s(mail)))
                parser.write(email)
                parser.end()
                let parsedEmail = await s
                if (parsedEmail.headers && Object.keys(parsedEmail.headers).filter(x => x.indexOf('\\seen') > 0).length > 0)
                    parsedEmail.headers.seen = true
                else parsedEmail.headers.seen = false
                if (parsedEmail.headers && Object.keys(parsedEmail.headers).filter(x => x.indexOf('\\flagged') > 0).length > 0) parsedEmail.headers.starred = true
                else parsedEmail.headers.starred = false
                try {
                    parsedEmail.headers.id = eval(Object.keys(parsedEmail.headers).filter(key => /\* [0-9]* fetch .*/g.test(key))[0].split(' ')[1])
                } catch(e) {
                    parsedEmail.headers.id = ('*' != stop ? stop : start)
                }
                return parsedEmail
            })
        ))
    }
}

module.exports = IMAP
