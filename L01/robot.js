// this loads a function and runs it
import path from 'path';

// Load the hello.js module
const helloModule = await import(path.resolve(process.cwd(), './hello.js'));
const goodbyeModule = await import(path.resolve(process.cwd(),'./goodbye.js'));
// Execute the 'execute' function from hello.js
const result = helloModule.execute("Robot");
const bye = goodbyeModule.execute("Robot");
// Display the result
console.log(result, bye);