import Crypto from "node:crypto";
export const generateID = () => {
  return Crypto.randomBytes(16).toString("hex").slice(0, 8).toUpperCase();
};
