import { describe, expect, it } from 'vitest';
import { recipeProject } from '../source/test-support/recipe-project.mts';

const RULE = 'pmd/HttpWithoutTimeout';
const PATH = 'src/main/java/shop/Remote.java';

const BUILDER = `package shop;

import java.net.URI;
import java.net.http.HttpRequest;

public final class Remote {
  HttpRequest.Builder open(URI uri) {
    HttpRequest.Builder builder = HttpRequest.newBuilder(uri);
    return builder;
  }
}
`;

const APACHE = `package shop;

import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;

public final class Remote {
  CloseableHttpClient client() {
    return HttpClients.createDefault();
  }
}
`;

const UNTIMED = `package shop;

import java.net.URI;
import java.net.http.HttpRequest;

public final class Remote {
  HttpRequest plain(URI uri) {
    return HttpRequest.newBuilder(uri).build();
  }
}
`;

function run(path: string, text: string) {
  const { result, read } = recipeProject({ files: { [path]: text }, rule: RULE });
  return { notes: result.notes, errors: result.toolErrors, text: read(path) };
}

describe('httpWithoutTimeoutRecipe declines', () => {
  it('leaves a builder that is kept in a variable', () => {
    expect(run(PATH, BUILDER)).toEqual({
      notes: [
        `pmd/HttpWithoutTimeout in ${PATH}:8: left as is, the builder is kept in a variable that this fix does not follow`,
      ],
      errors: [],
      text: BUILDER,
    });
  });

  it('leaves an Apache client, whose deadline needs a request configuration', () => {
    expect(run(PATH, APACHE)).toEqual({
      notes: [
        `pmd/HttpWithoutTimeout in ${PATH}:8: left as is, an Apache client takes its deadline from a RequestConfig that this fix does not pick`,
      ],
      errors: [],
      text: APACHE,
    });
  });

  it('leaves test sources, where a test talks to a local fake', () => {
    const path = 'src/test/java/shop/RemoteTest.java';

    expect(run(path, UNTIMED)).toEqual({ notes: [], errors: [], text: UNTIMED });
  });
});
