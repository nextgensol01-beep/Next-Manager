const React = require('react');
module.exports = function Link({ children, prefetch, ...props }) { return React.createElement('a', props, children); };
