/* WebGL2 calls for scene.goose. Included into the generated C by --include. */
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <emscripten.h>
#include <emscripten/html5.h>
#include <GLES3/gl3.h>

static GLuint g_prog, g_vao[4], g_vbo[4];
static int g_n[4];
static int g_w, g_h;
static unsigned char *g_pix;
static GLint u_mvp, u_model, u_color, u_outline, u_pass;

static GLuint compile(GLenum t, const char *src) {
    GLuint s = glCreateShader(t);
    glShaderSource(s, 1, &src, 0);
    glCompileShader(s);
    GLint ok; glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) { char b[1024]; glGetShaderInfoLog(s, 1024, 0, b); printf("shader error: %s\n", b); }
    return s;
}

static void gl_init(int32_t w, int32_t h) {
    g_w = w; g_h = h;
    EmscriptenWebGLContextAttributes a; emscripten_webgl_init_context_attributes(&a);
    a.majorVersion = 2; a.antialias = 0; a.alpha = 0; a.depth = 1; a.preserveDrawingBuffer = 1;
    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE c = emscripten_webgl_create_context("#canvas", &a);
    emscripten_webgl_make_context_current(c);
    emscripten_set_canvas_element_size("#canvas", w, h);
    const char *vs =
      "#version 300 es\n"
      "layout(location=0) in vec3 p; layout(location=1) in vec3 n;\n"
      "uniform mat4 mvp, model; uniform float pass;\n"
      "out vec3 vn;\n"
      "void main(){ vec3 q = p; vn = normalize(mat3(model)*n);\n"
      "  vec4 c = mvp*vec4(q,1.0);\n"
      "  if(pass>0.5){ vec4 d = mvp*vec4(n,0.0); c.xy += normalize(d.xy+1e-6)*0.012*c.w; }\n"
      "  gl_Position = c; }\n";
    const char *fs =
      "#version 300 es\nprecision highp float;\n"
      "in vec3 vn; uniform vec3 color; uniform float pass; out vec4 o;\n"
      "void main(){ if(pass>0.5){ o=vec4(0.08,0.07,0.1,1.0); return; }\n"
      "  float l = max(dot(normalize(vn), normalize(vec3(0.4,0.8,0.5))),0.0);\n"
      "  float q = l<0.2?0.45:(l<0.55?0.7:1.0);\n"
      "  o = vec4(color*q,1.0); }\n";
    g_prog = glCreateProgram();
    glAttachShader(g_prog, compile(GL_VERTEX_SHADER, vs));
    glAttachShader(g_prog, compile(GL_FRAGMENT_SHADER, fs));
    glLinkProgram(g_prog);
    { GLint ok; glGetProgramiv(g_prog, GL_LINK_STATUS, &ok); if (!ok) { char b[1024]; glGetProgramInfoLog(g_prog, 1024, 0, b); fprintf(stderr, "link error: %s\n", b); } }
    u_mvp = glGetUniformLocation(g_prog, "mvp");
    u_model = glGetUniformLocation(g_prog, "model");
    u_color = glGetUniformLocation(g_prog, "color");
    u_pass = glGetUniformLocation(g_prog, "pass");
    glGenVertexArrays(4, g_vao); glGenBuffers(4, g_vbo);
    g_pix = (unsigned char*)malloc((size_t)w * h * 4);
    glViewport(0, 0, w, h);
}

static void gl_mesh(int32_t id, sl_f32 d) {
    glBindVertexArray(g_vao[id]);
    glBindBuffer(GL_ARRAY_BUFFER, g_vbo[id]);
    glBufferData(GL_ARRAY_BUFFER, d.len * 4, d.data, GL_STATIC_DRAW);
    glEnableVertexAttribArray(0); glVertexAttribPointer(0, 3, GL_FLOAT, 0, 24, (void*)0);
    glEnableVertexAttribArray(1); glVertexAttribPointer(1, 3, GL_FLOAT, 0, 24, (void*)12);
    g_n[id] = (int)(d.len / 6);
}

static void gl_begin(float r, float g, float b) {
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glViewport(0, 0, g_w, g_h);
    glClearColor(r, g, b, 1); glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    glEnable(GL_DEPTH_TEST); glEnable(GL_CULL_FACE);
    glUseProgram(g_prog);
}

static GLuint g_skin, g_skin_vao, g_skin_n;
static GLint su_mvp, su_model, su_bones, su_pal, su_pass;
static void gl_draw(int32_t mesh, Mat_g *mvp, Mat_g *model, float r, float g, float b, int32_t outline) {
    glUseProgram(g_prog);
    glBindVertexArray(g_vao[mesh]);
    glUniformMatrix4fv(u_mvp, 1, 0, mvp->m_g.e);
    glUniformMatrix4fv(u_model, 1, 0, model->m_g.e);
    glUniform3f(u_color, r, g, b);
    if (outline) { glUniform1f(u_pass, 1.0f); glCullFace(GL_FRONT); glDrawArrays(GL_TRIANGLES, 0, g_n[mesh]); }
    glUniform1f(u_pass, 0.0f); glCullFace(GL_BACK); glDrawArrays(GL_TRIANGLES, 0, g_n[mesh]);
}

EMSCRIPTEN_KEEPALIVE unsigned char *toybox_read_pixels(void) {
    glReadPixels(0, 0, g_w, g_h, GL_RGBA, GL_UNSIGNED_BYTE, g_pix);
    return g_pix;
}

/* ---- skinned people (spike 2): one shared mesh, 20 bones, 4 weights per vertex ---- */
static unsigned char g_skin_buf[1 << 21];
EMSCRIPTEN_KEEPALIVE unsigned char *toybox_skin_buf(void) { return g_skin_buf; }
EMSCRIPTEN_KEEPALIVE void toybox_load_skin(const float *v, int nv, const unsigned short *idx, int ni) {
    const char *vs =
      "#version 300 es\n"
      "layout(location=0) in vec3 p; layout(location=1) in vec3 n; layout(location=2) in float reg;\n"
      "layout(location=3) in vec4 bi; layout(location=4) in vec4 bw;\n"
      "uniform mat4 mvp, model; uniform mat4 bones[20]; uniform float pass;\n"
      "out vec3 vn; flat out int vreg;\n"
      "void main(){\n"
      "  mat4 s = bw.x*bones[int(bi.x)] + bw.y*bones[int(bi.y)] + bw.z*bones[int(bi.z)] + bw.w*bones[int(bi.w)];\n"
      "  vec4 q = s*vec4(p,1.0); vec3 nn = mat3(s)*n; vreg = int(reg+0.5);\n"
      "  vn = normalize(mat3(model)*nn);\n"
      "  vec4 c = mvp*q;\n"
      "  if(pass>0.5){ vec4 d = mvp*vec4(nn,0.0); c.xy += normalize(d.xy+1e-6)*0.004*c.w; }\n"
      "  gl_Position = c; }\n";
    const char *fs =
      "#version 300 es\nprecision highp float;\n"
      "in vec3 vn; flat in int vreg; uniform vec3 pal[5]; uniform float pass; out vec4 o;\n"
      "void main(){ if(pass>0.5){ o=vec4(0.08,0.07,0.1,1.0); return; }\n"
      "  float l = max(dot(normalize(vn), normalize(vec3(0.4,0.8,0.5))),0.0);\n"
      "  float q = l<0.2?0.55:(l<0.55?0.78:1.0);\n"
      "  o = vec4(pal[vreg]*q,1.0); }\n";
    g_skin = glCreateProgram();
    glAttachShader(g_skin, compile(GL_VERTEX_SHADER, vs));
    glAttachShader(g_skin, compile(GL_FRAGMENT_SHADER, fs));
    glLinkProgram(g_skin);
    { GLint ok; glGetProgramiv(g_skin, GL_LINK_STATUS, &ok); if (!ok) { char b[1024]; glGetProgramInfoLog(g_skin, 1024, 0, b); fprintf(stderr, "skin link error: %s\n", b); } }
    su_mvp = glGetUniformLocation(g_skin, "mvp"); su_model = glGetUniformLocation(g_skin, "model");
    su_bones = glGetUniformLocation(g_skin, "bones"); su_pal = glGetUniformLocation(g_skin, "pal");
    su_pass = glGetUniformLocation(g_skin, "pass");
    GLuint vbo, ebo;
    glGenVertexArrays(1, &g_skin_vao); glBindVertexArray(g_skin_vao);
    glGenBuffers(1, &vbo); glBindBuffer(GL_ARRAY_BUFFER, vbo);
    glBufferData(GL_ARRAY_BUFFER, (size_t)nv * 60, v, GL_STATIC_DRAW);
    glEnableVertexAttribArray(0); glVertexAttribPointer(0, 3, GL_FLOAT, 0, 60, (void*)0);
    glEnableVertexAttribArray(1); glVertexAttribPointer(1, 3, GL_FLOAT, 0, 60, (void*)12);
    glEnableVertexAttribArray(2); glVertexAttribPointer(2, 1, GL_FLOAT, 0, 60, (void*)24);
    glEnableVertexAttribArray(3); glVertexAttribPointer(3, 4, GL_FLOAT, 0, 60, (void*)28);
    glEnableVertexAttribArray(4); glVertexAttribPointer(4, 4, GL_FLOAT, 0, 60, (void*)44);
    glGenBuffers(1, &ebo); glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ebo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, (size_t)ni * 2, idx, GL_STATIC_DRAW);
    g_skin_n = ni;
}

static void gl_draw_skin(Mat_g *mvp, Mat_g *model, sl_f32 bones, sl_f32 pal, int32_t outline) {
    glUseProgram(g_skin);
    glBindVertexArray(g_skin_vao);
    glUniformMatrix4fv(su_mvp, 1, 0, mvp->m_g.e);
    glUniformMatrix4fv(su_model, 1, 0, model->m_g.e);
    glUniformMatrix4fv(su_bones, 20, 0, bones.data);
    glUniform3fv(su_pal, 5, pal.data);
    if (outline) { glUniform1f(su_pass, 1.0f); glCullFace(GL_FRONT); glDrawElements(GL_TRIANGLES, g_skin_n, GL_UNSIGNED_SHORT, 0); }
    glUniform1f(su_pass, 0.0f); glCullFace(GL_BACK); glDrawElements(GL_TRIANGLES, g_skin_n, GL_UNSIGNED_SHORT, 0);
}
