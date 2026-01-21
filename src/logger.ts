import winston from "winston";

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;

  // Add metadata if present
  if (Object.keys(metadata).length > 0) {
    // Remove error stack from metadata display if it exists
    const { stack, ...cleanMetadata } = metadata;
    if (Object.keys(cleanMetadata).length > 0) {
      msg += ` ${JSON.stringify(cleanMetadata)}`;
    }
    // Add stack trace on new line if present
    if (stack) {
      msg += `\n${stack}`;
    }
  }

  return msg;
});

// Create the logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(errors({ stack: true }), timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" })),
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: combine(colorize({ all: true }), consoleFormat),
    }),
  ],
});

// Create child loggers for different modules
export const createLogger = (module: string) => {
  return logger.child({ module });
};

// Convenience exports for common log levels
export const logInfo = logger.info.bind(logger);
export const logError = logger.error.bind(logger);
export const logWarn = logger.warn.bind(logger);
export const logDebug = logger.debug.bind(logger);
