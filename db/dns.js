// Atlas mongodb+srv:// addresses need a DNS server that answers SRV lookups. Node's default
// resolver is refused on some Windows setups, so Google DNS stays the default.
// Set DNS_SERVERS=system to use the machine's resolver, or list others: DNS_SERVERS=1.1.1.1,1.0.0.1
const dns = require('dns');

const setting = process.env.DNS_SERVERS || '8.8.8.8,8.8.4.4';
if (setting !== 'system') dns.setServers(setting.split(',').map(s => s.trim()));
