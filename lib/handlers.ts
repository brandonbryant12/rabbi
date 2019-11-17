
import { join } from 'path';

import { config } from './config';

const handlers = requireHandlersDirectory(config.hapi.handlers.directory);
/* end handlers import */

export { handlers }

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function requireHandlersDirectory(dirname) {

  var handlers: any = require('require-all')({
    dirname,
    filter      :  /(.+)\.ts$/,
    map: function(name, path) {

      return name.split('_').map(p => {

        return capitalizeFirstLetter(p);

      })
      .join('');
    }
  });

  return handlers;
}


