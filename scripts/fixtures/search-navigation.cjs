const React = require('react');
module.exports = {
  useSearchParams: () => React.useMemo(() => new URLSearchParams(location.search), []),
  useRouter: () => ({replace(){},push(){},refresh(){}}),
  usePathname: () => location.pathname,
};
