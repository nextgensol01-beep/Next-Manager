const { createContext, createElement, useContext, useState } = require("react");

const session = { user: { id: "admin", role: "admin", email: "admin@example.com" } };
const SessionContext = createContext({ data: null, status: "unauthenticated", update: async () => {} });

exports.SessionProvider = function SessionProvider({ children }) {
  const [loading, setLoading] = useState(false);
  async function update() {
    setLoading(true);
    try {
      await fetch("/api/auth/session", { method: "POST" });
    } finally {
      setLoading(false);
    }
  }
  return createElement(SessionContext.Provider, { value: { data: session, status: loading ? "loading" : "authenticated", update } }, children);
};

exports.useSession = () => useContext(SessionContext);
exports.getProviders = async () => ({ google: { id: "google" } });
exports.signIn = async () => {};
