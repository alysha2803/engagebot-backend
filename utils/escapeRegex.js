// Escapes user input so it is matched literally inside a RegExp ("C++" would otherwise throw).
module.exports = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
