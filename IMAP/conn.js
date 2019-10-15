const tls = require('tls')
const hypertext = require('html-to-text')
const atob = require('atob')
const MailParser = require("mailparser-mit").MailParser;
const assert = require('assert')

const process_emails = (emails, start, stop) => emails
    .split(/(?=\* [0-9]* FETCH .*(\r\n|\n))/g)
    .filter(_ => _.length > 5)
    .map(async email => {
        const parser = new MailParser()
        const s = new Promise((s, j) => parser.on('end', mail => s(mail)))
        parser.write(email)
        parser.end()
        const parsed = await s

        if (parsed.headers) {
            const headers = Object.keys(parsed.headers)
            const hasHeader = h => headers.filter(header => header.includes(h)).length > 0
            parsed.headers.seen = hasHeader('\\seen')
            parsed.headers.starred = hasHeader('\\flagged')
            try {
                parsed.headers.id = eval(headers.filter(header => /\* [0-9]* fetch/g.test(header))[0].split(' ')[1])
            }
            catch (e) {
                parsed.headers.id = ('*' != stop ? stop : start)
            }
        }
        return parsed
    })

class IMAP {
    constructor(options) {
        this.opts = options || {}
        this.line = 1
        this.sock = null
        this.queue = {}
        this.buffer = ''
    }
    async close() {
        this.sock.destroy()
    }
    async open(host, port, user, pass, xoauth) {
        return await new Promise((s, j) => {

            let wait_for_connect = true

            if (this.sock) this.sock.destroy()
            this.sock = tls.connect({
                host: host || this.opts.host || null,
                port: port || this.opts.port || 993,
                user: user || this.opts.user || null,
                pass: pass || this.opts.pass || null
            }, () => s(!(wait_for_connect = false)))

            this.sock.setEncoding('utf8')
            const _this = this

            this.sock.on('data', d => {
                const r_ok = /((\n[0-9]{8})|(^[0-9]{8}))(?= (OK|NO))/gim
                const s = r_ok.exec(d)
                if (s) {
                    // clear the buffer and call corresponding waiter
                    const output = _this.buffer
                    _this.buffer = ''
                    const i = s[0].trim()
                    _this.queue[i]((output + d).trim())
                } else _this.buffer += d
            })

            setTimeout(() => {
                if (wait_for_connect) j(true);
            }, this.opts.timeout || 150000)
        })
    }
    padLine(n) {
        return `${n}`.padStart(8, '0')
    }
    async execute(command) {
        // hack using promise resolve as callback
        return await new Promise((s, _) => {
            // correct line number if needed
            let n = this.line
            while (this.queue[this.padLine(n)]) n++;
            // store resolve as callback + send command
            const line = this.padLine(n)
            this.queue[line] = s
            this.sock.write(`${line} ${command}\r\n`)
            this.line++;
        })
    }
    async exec(cmd, f) {
        const s = await this.execute(cmd).catch(console.error)
        const r_ok = /^[0-9]+ OK/gim
        assert(!!s.match(r_ok), 'Mailserver did not return OK')
        return f ? f(s) : s;
    }
    async countMessages(box) {
        return await this.exec(`STATUS ${box} (MESSAGES)`, d => {
            const n = d.match(/[0-9]*/g).filter(_ => _)[0]
            // TODO: eval is a serious security bug if mailservers act malicious
            return eval(n)
        })
    }
    async login(username, password, xoauth) {
        if (password || this.opts.pass)
            return await this.exec(`LOGIN ${username || this.opts.user} ${password || this.opts.pass}`)
        else {
            const s = await this.exec(`AUTHENTICATE XOAUTH2 ${xoauth || this.opts.xoauth}`)
            // some mailservers get angry if you dont respond empty in next line after XOAUTH
            this.exec(``)
            return s
        }
    }
    async moveTo(uid, fromFolder, toFolder) {
        await this.select(fromFolder)
        await this.exec(`COPY ${uid} ${toFolder}`)
        return await this.exec(`STORE ${uid} +FLAGS \\Deleted`)
        // we do this without EXPUNGE. if you want to expunge, uncomment below line
        //return await this.exec('EXPUNGE')
    }
    async deleteMessages(uid) {
        return await this.exec(`STORE ${uid} +FLAGS \\Deleted`)
    }
    async restoreMessages(uid) {
        return await this.exec(`STORE ${uid} -FLAGS \\Deleted`)
    }
    async star(uid) {
        return await this.exec(`STORE ${uid} +FLAGS \\flagged`)
    }
    async unstar(uid) {
        return await this.exec(`STORE ${uid} -FLAGS \\flagged`)
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
    async select(boxName) { //console.log("SELECT "+boxName)
        return await this.exec(`SELECT ${boxName}`)
    }
    async getSenders(start, stop) {
        return await this.exec(`FETCH ${start || 1}${stop ? ':' + stop : ''} (FLAGS BODY.PEEK[HEADER.FIELDS (FROM)])`, d => Promise.all(process_emails(d, start, stop)))
    }
    async getEmails(start, stop) {
        return await this.exec(`FETCH ${start || 1}${stop ? ':' + stop : ''} (FLAGS BODY.PEEK[])`, (d) => Promise.all(process_emails(d, start, stop)))
    }
}

module.exports = IMAP