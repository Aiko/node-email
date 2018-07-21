const tls = require('tls')

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
                if (d.indexOf('OK') < 0) j(d)
                else s(f ? f(d) : d)
            })
        }).catch((e) => j(e))
    }
    async login(u, p) {
        return await this.exec(`LOGIN ${u || this.opts.user} ${p || this.opts.pass}`)
    }
    async getFolders() {
        return await this.exec(`LIST "" "%"`, (d) => {
            return d.match(/(([a-zA-Z]+)|(\"[a-zA-Z ]+\"))(?=\r*\n)/g)
        })
    }
}

module.exports = IMAP