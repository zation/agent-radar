import path from "node:path";
import { formatDeliveryStatus, readDeliveryStatus, validateDeliveryDocuments } from "../delivery/documents.js";

const root = path.resolve(process.cwd(), "docs/delivery");
const command = process.argv[2] ?? "check";

if (command === "check") {
  const errors = validateDeliveryDocuments(root);
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Delivery documents are valid.");
  }
} else if (command === "status") {
  console.log(formatDeliveryStatus(readDeliveryStatus(root)));
} else {
  console.error(`Unknown delivery docs command: ${command}`);
  process.exitCode = 1;
}
