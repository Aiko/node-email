const tls = require('tls')
const hypertext = require('html-to-text')

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
                if (/(\n[0-9]{8})|(^[0-9]{8})/g.exec(d)) {
                    let output = _this.buffer
                    _this.buffer = ''
                    _this.queue[/(\n[0-9]{8})|(^[0-9]{8})/g.exec(d)[0].trim()]((output + d).trim())
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
                console.log("GOT RES")
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
        return await this.exec(`FETCH ${start || 1}${stop ? ':' + stop : ''} (FLAGS BODY.PEEK[TEXT] BODY.PEEK[HEADER.FIELDS (DATE FROM SUBJECT)])`, (d) => {
            return d.split(d.indexOf('Content-Type') < 0 ? /.?BODY\[HEADER.*(\r\n|\n)/g : /(\n|^)\* [0-9]* FETCH .*/g).filter(_ => _) // split into parts, filter out nonsense
                .map(email => email.split(/(\r\n|\n)--_[A-Za-z0-9_]*/g)) // split on mime separators
                .map(email => email.filter(part => part.length > 5)) // filter out inner nonsense
                .filter(_ => _.length > 0) // filter out nonsense
                .map(email => {
                    let header = email
                        .filter(part => part.indexOf('HEADER') > -1)[0] // identify header part
                        .replace(/(^.*(\r\n|\n))|((\r\n|\n).*$)/g, '') // strip start and end
                        .split(/(\r\n|\n)/g) // split into lines
                        .map(line => [line.substring(0, line.indexOf(':')), line.substring(line.indexOf(':') + 1).trim()])
                    let mime_in_a_box = email.filter(part => part.indexOf('text/plain') > -1)[0]
                    if (mime_in_a_box) mime_in_a_box = mime_in_a_box
                        .replace(/.*Content-T.*(\r\n|\n)/g, '')
                        .replace(/=(\r|\n|\t)+/g, '')
                        .trim()
                    // turns header into key, value format
                    try {
                        return {
                            from: header.filter(field => field[0].toLowerCase() == 'from')[0][1],
                            subject: header.filter(field => field[0].toLowerCase() == 'subject')[0][1],
                            date: header.filter(field => field[0].toLowerCase() == 'date')[0][1],
                            body: email.filter(part => part.indexOf('text/html') > -1)[0] || email[0],
                            text: mime_in_a_box || email[0]
                        }
                    } catch (e) {
                        console.log(e)
                    }
                })
        })
    }
}

module.exports = IMAP