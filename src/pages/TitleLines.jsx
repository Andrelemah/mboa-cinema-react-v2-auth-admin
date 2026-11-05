import { Fragment } from 'react';

/** Render the line breaks in our translation strings as React elements. */
export default function TitleLines({ children }) {
  return String(children).split(/<br\s*\/?\s*>/i).map((line, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {line}
    </Fragment>
  ));
}
