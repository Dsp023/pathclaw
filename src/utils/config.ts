import Conf from "conf";

let _config: InstanceType<typeof Conf> | null = null;

export function getConfig(): InstanceType<typeof Conf> {
  if (!_config) {
    _config = new Conf({ projectName: "pathclaw" });
  }
  return _config;
}