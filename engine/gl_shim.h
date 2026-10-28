/* WebGL2 calls for scene.goose. Included into the generated C by --include. */
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <emscripten.h>
#include <emscripten/html5.h>
#include <GLES3/gl3.h>

#define MAX_MESH 512
static GLuint g_prog, g_vao[MAX_MESH], g_vbo[MAX_MESH];
static int g_n[MAX_MESH];
static int g_w, g_h;
static float g_ldir[3] = {0.4f, 0.8f, 0.5f}, g_lcol[3] = {1, 1, 1};
static GLint u_mvp, u_model, u_color, u_pass, u_alpha, u_ldir, u_lcol;

static GLuint compile(GLenum t, const char *src) {
    GLuint s = glCreateShader(t);
    glShaderSource(s, 1, &src, 0);
    glCompileShader(s);
    GLint ok; glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) { char b[1024]; glGetShaderInfoLog(s, 1024, 0, b); printf("shader error: %s\n", b); }
    return s;
}

static GLuint link2(const char *vs, const char *fs) {
    GLuint p = glCreateProgram();
    glAttachShader(p, compile(GL_VERTEX_SHADER, vs));
    glAttachShader(p, compile(GL_FRAGMENT_SHADER, fs));
    glLinkProgram(p);
    GLint ok; glGetProgramiv(p, GL_LINK_STATUS, &ok);
    if (!ok) { char b[1024]; glGetProgramInfoLog(p, 1024, 0, b); fprintf(stderr, "link error: %s\n", b); }
    return p;
}

/* Toon light: three steps. The outline pass pushes the back faces out in clip space. */
#define LIGHT_FS \
  "uniform vec3 ldir; uniform vec3 lcol;\n" \
  "vec3 toon(vec3 n, vec3 c){ float l = max(dot(normalize(n), normalize(ldir)),0.0);\n" \
  "  float q = l<0.2?0.5:(l<0.55?0.75:1.0); return c*lcol*q; }\n"

static GLuint g_ground_prog, g_ground_vao, g_ground_tex;
static GLint gu_mvp, gu_lcol;

static void gl_init(int32_t w, int32_t h) {
    g_w = w; g_h = h;
    EmscriptenWebGLContextAttributes a; emscripten_webgl_init_context_attributes(&a);
    a.majorVersion = 2; a.antialias = 1; a.alpha = 0; a.depth = 1; a.preserveDrawingBuffer = 1;
    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE c = emscripten_webgl_create_context("#canvas", &a);
    emscripten_webgl_make_context_current(c);
    emscripten_set_canvas_element_size("#canvas", w, h);
    const char *vs =
      "#version 300 es\n"
      "layout(location=0) in vec3 p; layout(location=1) in vec3 n;\n"
      "uniform mat4 mvp, model; uniform float pass;\n"
      "out vec3 vn;\n"
      "void main(){ vn = normalize(mat3(model)*n);\n"
      "  vec4 c = mvp*vec4(p,1.0);\n"
      "  if(pass>0.5){ vec4 d = mvp*vec4(n,0.0); c.xy += normalize(d.xy+1e-6)*0.0035*c.w; }\n"
      "  gl_Position = c; }\n";
    const char *fs =
      "#version 300 es\nprecision highp float;\n" LIGHT_FS
      "in vec3 vn; uniform vec3 color; uniform float pass, alpha; out vec4 o;\n"
      "void main(){ if(pass>0.5){ o=vec4(0.08,0.07,0.1,1.0); return; }\n"
      "  o = vec4(toon(vn, color), alpha); }\n";
    g_prog = link2(vs, fs);
    u_mvp = glGetUniformLocation(g_prog, "mvp"); u_model = glGetUniformLocation(g_prog, "model");
    u_color = glGetUniformLocation(g_prog, "color"); u_pass = glGetUniformLocation(g_prog, "pass");
    u_alpha = glGetUniformLocation(g_prog, "alpha"); u_ldir = glGetUniformLocation(g_prog, "ldir");
    u_lcol = glGetUniformLocation(g_prog, "lcol");
    glGenVertexArrays(MAX_MESH, g_vao); glGenBuffers(MAX_MESH, g_vbo);
    /* ground texture quad (OneMap tiles) */
    const char *gvs =
      "#version 300 es\nlayout(location=0) in vec3 p; uniform mat4 mvp; out vec2 uv;\n"
      "void main(){ uv = p.xz + 0.5; gl_Position = mvp*vec4(p,1.0); }\n";
    const char *gfs =
      "#version 300 es\nprecision highp float; in vec2 uv; uniform sampler2D tex; uniform vec3 lcol; out vec4 o;\n"
      "void main(){ o = vec4(texture(tex, uv).rgb*lcol, 1.0); }\n";
    g_ground_prog = link2(gvs, gfs);
    gu_mvp = glGetUniformLocation(g_ground_prog, "mvp"); gu_lcol = glGetUniformLocation(g_ground_prog, "lcol");
    float q[18] = {-0.5f,0,-0.5f, 0.5f,0,-0.5f, 0.5f,0,0.5f, -0.5f,0,-0.5f, 0.5f,0,0.5f, -0.5f,0,0.5f};
    GLuint vb; glGenVertexArrays(1, &g_ground_vao); glBindVertexArray(g_ground_vao);
    glGenBuffers(1, &vb); glBindBuffer(GL_ARRAY_BUFFER, vb);
    glBufferData(GL_ARRAY_BUFFER, sizeof q, q, GL_STATIC_DRAW);
    glEnableVertexAttribArray(0); glVertexAttribPointer(0, 3, GL_FLOAT, 0, 12, (void*)0);
    glViewport(0, 0, w, h);
}

static void gl_resize(int32_t w, int32_t h) {
    g_w = w; g_h = h;
    emscripten_set_canvas_element_size("#canvas", w, h);
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

/* Shared upload buffer: JavaScript writes here, then calls a toybox_* loader. */
static unsigned char g_up_buf[1 << 22];
EMSCRIPTEN_KEEPALIVE unsigned char *toybox_up_buf(void) { return g_up_buf; }
EMSCRIPTEN_KEEPALIVE int toybox_up_size(void) { return (int)sizeof g_up_buf; }

/* A custom mesh (for example extruded building footprints): nfloats of pos+normal, 6 per vertex. */
EMSCRIPTEN_KEEPALIVE void toybox_mesh_upload(int id, int nfloats) {
    glBindVertexArray(g_vao[id]);
    glBindBuffer(GL_ARRAY_BUFFER, g_vbo[id]);
    glBufferData(GL_ARRAY_BUFFER, (size_t)nfloats * 4, g_up_buf, GL_STATIC_DRAW);
    glEnableVertexAttribArray(0); glVertexAttribPointer(0, 3, GL_FLOAT, 0, 24, (void*)0);
    glEnableVertexAttribArray(1); glVertexAttribPointer(1, 3, GL_FLOAT, 0, 24, (void*)12);
    g_n[id] = nfloats / 6;
}

/* RGBA pixels (w by h) for the map ground quad. */
EMSCRIPTEN_KEEPALIVE void toybox_ground_upload(int w, int h) {
    if (!g_ground_tex) glGenTextures(1, &g_ground_tex);
    glBindTexture(GL_TEXTURE_2D, g_ground_tex);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, g_up_buf);
    glGenerateMipmap(GL_TEXTURE_2D);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
}

static void gl_begin(float r, float g, float b) {
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glViewport(0, 0, g_w, g_h);
    glClearColor(r, g, b, 1); glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    glEnable(GL_DEPTH_TEST); glEnable(GL_CULL_FACE);
    glUseProgram(g_prog);
}

static void gl_light(float dx, float dy, float dz, float lr, float lg, float lb) {
    g_ldir[0] = dx; g_ldir[1] = dy; g_ldir[2] = dz; g_lcol[0] = lr; g_lcol[1] = lg; g_lcol[2] = lb;
}

static void gl_front(int32_t flip) { glFrontFace(flip ? GL_CW : GL_CCW); }

static void gl_draw(int32_t mesh, Mat_g *mvp, Mat_g *model, float r, float g, float b, float a, int32_t outline) {
    glUseProgram(g_prog);
    glBindVertexArray(g_vao[mesh]);
    glUniformMatrix4fv(u_mvp, 1, 0, mvp->m_g.e);
    glUniformMatrix4fv(u_model, 1, 0, model->m_g.e);
    glUniform3f(u_color, r, g, b);
    glUniform3fv(u_ldir, 1, g_ldir); glUniform3fv(u_lcol, 1, g_lcol);
    glUniform1f(u_alpha, a);
    if (a < 0.99f) { glEnable(GL_BLEND); glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA); glDepthMask(GL_FALSE); }
    if (outline) { glUniform1f(u_pass, 1.0f); glCullFace(GL_FRONT); glDrawArrays(GL_TRIANGLES, 0, g_n[mesh]); }
    glUniform1f(u_pass, 0.0f); glCullFace(GL_BACK); glDrawArrays(GL_TRIANGLES, 0, g_n[mesh]);
    if (a < 0.99f) { glDisable(GL_BLEND); glDepthMask(GL_TRUE); }
}

static void gl_draw_ground(Mat_g *mvp) {
    if (!g_ground_tex) return;
    glUseProgram(g_ground_prog);
    glUniformMatrix4fv(gu_mvp, 1, 0, mvp->m_g.e);
    glUniform3fv(gu_lcol, 1, g_lcol);
    glBindTexture(GL_TEXTURE_2D, g_ground_tex);
    glBindVertexArray(g_ground_vao);
    glDisable(GL_CULL_FACE);
    /* the map lies 2 mm above the ground box: pull it forward in depth, or far cameras show the ground through it */
    glEnable(GL_POLYGON_OFFSET_FILL); glPolygonOffset(-2.0f, -8.0f);
    glDrawArrays(GL_TRIANGLES, 0, 6);
    glDisable(GL_POLYGON_OFFSET_FILL);
    glEnable(GL_CULL_FACE);
}

EMSCRIPTEN_KEEPALIVE unsigned char *toybox_read_pixels(void) {
    static unsigned char *pix; if (!pix) pix = (unsigned char*)malloc((size_t)g_w * g_h * 4);
    glReadPixels(0, 0, g_w, g_h, GL_RGBA, GL_UNSIGNED_BYTE, pix);
    return pix;
}

/* ---- skinned people: two shared meshes (0 full, 1 LOD), 20 bones, 4 weights per vertex ---- */
static GLuint g_skin, g_skin_vao[2], g_skin_n[2];
static GLint su_mvp, su_model, su_bones, su_pal, su_pass, su_ldir, su_lcol;

EMSCRIPTEN_KEEPALIVE void toybox_load_skin(int id, int nv, int ni) {
    const float *v = (const float *)(g_up_buf);
    const unsigned short *idx = (const unsigned short *)(g_up_buf + (size_t)nv * 60);
    if (!g_skin) {
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
          "  if(pass>0.5){ vec4 d = mvp*vec4(nn,0.0); c.xy += normalize(d.xy+1e-6)*0.0028*c.w; }\n"
          "  gl_Position = c; }\n";
        const char *fs =
          "#version 300 es\nprecision highp float;\n" LIGHT_FS
          "in vec3 vn; flat in int vreg; uniform vec3 pal[8]; uniform float pass; out vec4 o;\n"
          "void main(){ if(pass>0.5){ if(vreg==5||vreg==7) discard; o=vec4(0.08,0.07,0.1,1.0); return; }\n"
          "  o = vec4(toon(vn, pal[vreg]), 1.0); }\n";
        g_skin = link2(vs, fs);
        su_mvp = glGetUniformLocation(g_skin, "mvp"); su_model = glGetUniformLocation(g_skin, "model");
        su_bones = glGetUniformLocation(g_skin, "bones"); su_pal = glGetUniformLocation(g_skin, "pal");
        su_pass = glGetUniformLocation(g_skin, "pass"); su_ldir = glGetUniformLocation(g_skin, "ldir");
        su_lcol = glGetUniformLocation(g_skin, "lcol");
    }
    GLuint vbo, ebo;
    glGenVertexArrays(1, &g_skin_vao[id]); glBindVertexArray(g_skin_vao[id]);
    glGenBuffers(1, &vbo); glBindBuffer(GL_ARRAY_BUFFER, vbo);
    glBufferData(GL_ARRAY_BUFFER, (size_t)nv * 60, v, GL_STATIC_DRAW);
    glEnableVertexAttribArray(0); glVertexAttribPointer(0, 3, GL_FLOAT, 0, 60, (void*)0);
    glEnableVertexAttribArray(1); glVertexAttribPointer(1, 3, GL_FLOAT, 0, 60, (void*)12);
    glEnableVertexAttribArray(2); glVertexAttribPointer(2, 1, GL_FLOAT, 0, 60, (void*)24);
    glEnableVertexAttribArray(3); glVertexAttribPointer(3, 4, GL_FLOAT, 0, 60, (void*)28);
    glEnableVertexAttribArray(4); glVertexAttribPointer(4, 4, GL_FLOAT, 0, 60, (void*)44);
    glGenBuffers(1, &ebo); glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ebo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, (size_t)ni * 2, idx, GL_STATIC_DRAW);
    g_skin_n[id] = ni;
}

static void gl_draw_skin(int32_t lod, Mat_g *mvp, Mat_g *model, sl_f32 bones, sl_f32 pal, int32_t outline) {
    if (!g_skin_n[lod]) return;
    glUseProgram(g_skin);
    glBindVertexArray(g_skin_vao[lod]);
    glUniformMatrix4fv(su_mvp, 1, 0, mvp->m_g.e);
    glUniformMatrix4fv(su_model, 1, 0, model->m_g.e);
    glUniformMatrix4fv(su_bones, 20, 0, bones.data);
    glUniform3fv(su_pal, 8, pal.data);
    glUniform3fv(su_ldir, 1, g_ldir); glUniform3fv(su_lcol, 1, g_lcol);
    if (outline) { glUniform1f(su_pass, 1.0f); glCullFace(GL_FRONT); glDrawElements(GL_TRIANGLES, g_skin_n[lod], GL_UNSIGNED_SHORT, 0); }
    glUniform1f(su_pass, 0.0f); glCullFace(GL_BACK); glDrawElements(GL_TRIANGLES, g_skin_n[lod], GL_UNSIGNED_SHORT, 0);
}
