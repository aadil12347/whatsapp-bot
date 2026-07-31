const b64 = 'YUhSMGNITTZMeTkyWTJ4dmRXUXVlbWx3TDJKd2MyNDNjREZpYjNSMGFEZGtkajkwYjJ0bGJqMWFiWEF5VGtWTmQxSnVSalZUUkZwVFZFZE9WbVJHVGpGVlUzUjNUa1p3YTFWNlFYbGlNV1JPVld4T2JsTnNjRmhUUm1OeVdUQlpNbHA2TUQwPQ==';
const s1 = Buffer.from(b64, 'base64').toString('utf-8');
const s2 = Buffer.from(s1, 'base64').toString('utf-8');
console.log('Decoded Step 1:', s1);
console.log('Decoded Step 2:', s2);
