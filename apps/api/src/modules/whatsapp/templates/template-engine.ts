export class TemplateEngine {
  static render(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      variables[key] !== undefined ? variables[key] : `{{${key}}}`,
    );
  }

  static extractVariables(template: string): string[] {
    const matches = template.match(/\{\{(\w+)\}\}/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.replace(/[{}]/g, '')))];
  }

  static hasAllVariables(template: string, variables: Record<string, string>): boolean {
    const required = this.extractVariables(template);
    return required.every((key) => variables[key] !== undefined && variables[key] !== '');
  }
}
