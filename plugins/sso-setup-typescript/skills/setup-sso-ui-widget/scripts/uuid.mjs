// uuid — print a random UUID (replaces PowerShell [guid]::NewGuid()).
// Usage: node uuid.mjs
import { randomUUID } from "node:crypto";
console.log(randomUUID());
