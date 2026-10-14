import React, { createContext, useContext, useState } from "react";
const Context = createContext<any>(null);
export function FinancialYearFixtureProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [year, setYear] = useState("2025-26");
  (window as any).setFixtureFinancialYear = setYear;
  return (
    <Context.Provider value={[year, setYear, true]}>
      {children}
    </Context.Provider>
  );
}
export const useFinancialYearState = () => useContext(Context);
export const useFinancialYearPreference = () => ({
  financialYear: "2025-26",
  loaded: true,
});
