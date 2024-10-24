import Main from "./MediaServer/Main";

let streamingServer = new Main();
streamingServer.start();

// const logMemoryUsage = () => {
//   const memoryUsage: NodeJS.MemoryUsage = process.memoryUsage();
//   for (let key in memoryUsage) {
//     if (memoryUsage.hasOwnProperty(key)) {
//       console.log(`${key}: ${(memoryUsage[key as keyof NodeJS.MemoryUsage] / 1024 / 1024).toFixed(2)} MB `);
//     }
//   }
//   console.log("\r\n");
// };
// logMemoryUsage();

// setInterval(() => {
//   logMemoryUsage();
// }, 5000);
