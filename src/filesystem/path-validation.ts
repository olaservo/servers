import path from 'path';

/**
 * Checks if an absolute path is within any of the allowed directories.
 * 
 * @param absolutePath - The absolute path to check (will be normalized)
 * @param allowedDirectories - Array of absolute allowed directory paths (will be normalized)
 * @returns true if the path is within an allowed directory, false otherwise
 * @throws Error if given relative paths after normalization
 */
export function isPathWithinAllowedDirectories(absolutePath: string, allowedDirectories: string[]): boolean {
  // Type validation
  if (typeof absolutePath !== 'string' || !Array.isArray(allowedDirectories)) {
    return false;
  }

  // Reject empty inputs
  if (!absolutePath || allowedDirectories.length === 0) {
    return false;
  }

  // Reject null bytes (forbidden in paths)
  if (absolutePath.includes('\x00')) {
    return false;
  }

  // Normalize the input path
  let normalizedPath: string;
  try {
    normalizedPath = path.resolve(path.normalize(absolutePath));
  } catch {
    return false;
  }

  // Verify it's absolute after normalization
  if (!path.isAbsolute(normalizedPath)) {
    throw new Error('Path must be absolute after normalization');
  }

  // Check against each allowed directory
  return allowedDirectories.some(dir => {
    if (typeof dir !== 'string' || !dir) {
      return false;
    }

    // Reject null bytes in allowed dirs
    if (dir.includes('\x00')) {
      return false;
    }

    // Normalize the allowed directory
    let normalizedDir: string;
    try {
      normalizedDir = path.resolve(path.normalize(dir));
    } catch {
      return false;
    }

    // Verify allowed directory is absolute after normalization
    if (!path.isAbsolute(normalizedDir)) {
      throw new Error('Allowed directories must be absolute paths after normalization');
    }

    // Windows/NTFS is case-insensitive, so fold case before comparison (#470).
    // The paths are already normalized, so only their casing can differ here.
    // POSIX filesystems are case-sensitive, so compare as-is there.
    const isWindows = path.sep === '\\';
    const cmpPath = isWindows ? normalizedPath.toLowerCase() : normalizedPath;
    const cmpDir = isWindows ? normalizedDir.toLowerCase() : normalizedDir;

    // Check if normalizedPath is within normalizedDir
    // Path is inside if it's the same or a subdirectory
    if (cmpPath === cmpDir) {
      return true;
    }

    // Special case for POSIX root directory to avoid double slash
    if (normalizedDir === path.sep) {
      return normalizedPath.startsWith(path.sep);
    }

    // On Windows, also check for drive root (e.g., "C:\").
    // startsWith on the "<drive>:\" prefix already enforces a same-drive match.
    if (isWindows && /^[A-Za-z]:\\?$/.test(normalizedDir)) {
      return cmpPath.startsWith(cmpDir.replace(/\\?$/, '\\'));
    }

    // Tolerate a trailing separator on the allowed dir. A bare UNC share root
    // ("\\server\share") resolves to "\\server\share\", and appending another
    // separator would produce a double separator that never matches (#4265).
    const cmpDirWithSep = cmpDir.endsWith(path.sep) ? cmpDir : cmpDir + path.sep;
    return cmpPath.startsWith(cmpDirWithSep);
  });
}
