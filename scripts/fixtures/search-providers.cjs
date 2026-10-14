const React = require('react');
module.exports = {
  useFinancialYearState: () => { const [fy,setFy] = React.useState('2025-26'); return [fy,setFy,true]; },
  useFinancialYearPreference: () => ({ effectiveFinancialYear:'2025-26',currentFinancialYear:'2025-26',isLoaded:true }),
  useTheme: () => ({dark:false}),
};
