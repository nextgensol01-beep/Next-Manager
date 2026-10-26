const React = require('react');
const Context = React.createContext('/dashboard/client-trackers');
exports.Context = Context;
exports.usePathname = () => React.useContext(Context);
exports.Link = function Link({ href, children, onClick, scroll, prefetch, replace, ...props }) {
  return React.createElement('a', { ...props, href, onClick(event) {
    onClick?.(event);
    if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === '_blank') return;
    event.preventDefault(); window.navigationFixture.go(String(href), replace);
  } }, children);
};
exports.__esModule = true;
exports.default = exports.Link;
