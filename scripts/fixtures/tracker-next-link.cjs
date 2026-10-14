const React = require('react');
module.exports = function Link({ children, ...props }) { return React.createElement('a', props, children); };
