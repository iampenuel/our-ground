export function assertNode24(version = process.versions.node) {
  if (Number(version.split('.')[0]) !== 24) {
    throw new Error(`Our Ground requires Node 24.x; found ${version}. Run "nvm use" in the project directory, then retry.`);
  }
}

assertNode24();
