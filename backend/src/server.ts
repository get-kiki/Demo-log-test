import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);

// host ต้องเป็น 0.0.0.0 ไม่ใช่ default (127.0.0.1) ของ Fastify — รันใน container
// ถ้า bind แค่ loopback จะรับ request จากนอก container ไม่ได้เลย
buildApp()
  .then((app) => app.listen({ port, host: "0.0.0.0" }))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
