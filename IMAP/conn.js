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
                if (d.length > 8 && isNaN(d.slice(0, 8))) _this.buffer += d
                else {
                    let output = _this.buffer
                    _this.buffer = ''
                    _this.queue[d.slice(0, 8)](output + d)
                }
            })
            setTimeout(() => timeout ? j('timeout') : null, this.opts.timeout || 3000)
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
    async login(u, p) {
        u = u || this.opts.user
        p = p || this.opts.pass
        return await new Promise((s, j) => {
            this.execute(`LOGIN ${u} ${p}`).then((d) => {
                if (d.indexOf('OK LOGIN completed') < 0) j(d)
                else s()
            }).catch((e) => j(e))
        })
    }
}

module.exports = IMAP