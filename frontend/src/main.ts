import "./styles.css";
import { bootstrap } from "./app/bootstrap.js";

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
});
