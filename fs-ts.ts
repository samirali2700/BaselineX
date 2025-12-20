import { readFileSync } from "fs";

console.log("fs is working");
console.log(readFileSync("./package.json", "utf8").slice(0, 20));
